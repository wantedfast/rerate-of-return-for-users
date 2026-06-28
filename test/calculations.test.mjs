import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { calculateAll, calculateAshareTimeline, calculateSummary, roundCurrency } from "../src/calculations.js";
import { createApp } from "../server/app.js";

const repoRoot = path.resolve(import.meta.dirname, "..");

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readDefaultData() {
  return readJson(path.join(repoRoot, "data", "investment-data.json"));
}

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return server;
}

function byId(summary) {
  return Object.fromEntries(summary.map((row) => [row.personId, row]));
}

test("default data matches the confirmed staged A-share, U.S. stock, and fund result", async () => {
  const rows = byId(calculateSummary(await readDefaultData()));

  assert.equal(roundCurrency(rows.wang.totalProfit), -1344.92);
  assert.equal(roundCurrency(rows.chen.totalProfit), -948.74);
  assert.equal(roundCurrency(rows.nanjing.totalProfit), -1328.23);
  assert.equal(roundCurrency(rows.garlicm.totalProfit), 154.12);
  assert.equal(roundCurrency(rows.sugar.totalProfit), -3075.6);

  assert.equal(roundCurrency(rows.wang.aShareProfit), -517.63);
  assert.equal(roundCurrency(rows.wang.fundProfit), -34.54);
  assert.equal(roundCurrency(rows.wang.usProfit), -792.75);

  assert.equal(roundCurrency(rows.garlicm.capital), 20036.76);
  assert.equal(roundCurrency(rows.garlicm.usProfit), -933.59);
  assert.equal(rows.garlicm.fee, 0);

  assert.equal(roundCurrency(rows.sugar.capital), 20056);
  assert.equal(roundCurrency(rows.sugar.usProfit), -3006.52);
  assert.equal(rows.sugar.fee, 0);
});

test("U.S. stock uses staged realized and floating P/L allocation", async () => {
  const data = await readDefaultData();
  const rows = byId(calculateSummary(data));
  const totals = calculateAll(data).totals;

  assert.equal(data.assetSnapshots.usStock.earlyRealizedPnlJpy, -30488);
  assert.equal(data.assetSnapshots.usStock.laterRealizedPnlJpy, -9862);
  assert.equal(data.assetSnapshots.usStock.floatingPnlJpy, -88360);
  assert.equal(roundCurrency(totals.usProfit), -5405.82);
  assert.equal(roundCurrency(rows.sugar.usProfit), -3006.52);
  assert.equal(roundCurrency(rows.garlicm.usProfit), -933.59);
});

test("fund current asset only changes Wang fund allocation", async () => {
  const data = await readDefaultData();
  const base = byId(calculateSummary(data));
  const changed = byId(calculateSummary({
    ...data,
    dailyBalances: data.dailyBalances.map((row, index, rows) => index === rows.length - 1
      ? { ...row, fundCurrentCny: 5100 }
      : row)
  }));

  for (const personId of ["chen", "nanjing", "garlicm", "sugar"]) {
    assert.equal(roundCurrency(base[personId].fundProfit), roundCurrency(changed[personId].fundProfit));
  }

  assert.notEqual(roundCurrency(base.wang.fundProfit), roundCurrency(changed.wang.fundProfit));
  assert.equal(roundCurrency(base.wang.fundProfit), -34.54);
  assert.equal(roundCurrency(base.chen.fundProfit), 0);
  assert.equal(roundCurrency(base.nanjing.fundProfit), 0);
});

test("fund deposit increases fund principal instead of fund profit", async () => {
  const data = await readDefaultData();
  const changed = calculateAll({
    ...data,
    dailyBalances: data.dailyBalances.map((row, index, rows) => index === rows.length - 1
      ? { ...row, fundCurrentCny: 6500 }
      : row),
    flows: [
      ...data.flows,
      {
        id: "fund-wang-extra-1500",
        date: "2026-06-24",
        assetType: "fund",
        type: "deposit",
        amount: 1500,
        timing: "pre",
        holderType: "person",
        holderId: "wang"
      }
    ]
  });
  const rows = byId(changed.summary);

  assert.equal(roundCurrency(changed.splits.fund.capitalByPerson.wang), 6500);
  assert.equal(roundCurrency(rows.wang.fundProfit), 0);
});

test("fund withdrawal reduces fund principal instead of becoming a loss", async () => {
  const data = await readDefaultData();
  const changed = calculateAll({
    ...data,
    dailyBalances: data.dailyBalances.map((row, index, rows) => index === rows.length - 1
      ? { ...row, fundCurrentCny: 4000 }
      : row),
    flows: [
      ...data.flows,
      {
        id: "fund-wang-withdraw-1000",
        date: "2026-06-24",
        assetType: "fund",
        type: "withdrawal",
        amount: 1000,
        timing: "pre",
        holderType: "person",
        holderId: "wang"
      }
    ]
  });
  const rows = byId(changed.summary);

  assert.equal(roundCurrency(changed.splits.fund.capitalByPerson.wang), 4000);
  assert.equal(roundCurrency(rows.wang.fundProfit), 0);
});

test("daily balance blanks carry forward previous balances and FX rate", async () => {
  const data = await readDefaultData();
  const changed = calculateAll({
    ...data,
    dailyBalances: [
      ...data.dailyBalances,
      {
        id: "blank-carry",
        date: "2026-06-25",
        ashareTotalCny: null,
        usCurrentJpy: null,
        jpyCnyRate: null,
        fundCurrentCny: null
      }
    ]
  });

  assert.equal(changed.data.dailyBalancesWithCarry.at(-1).effectiveAshareTotalCny, 22476.04);
  assert.equal(changed.data.dailyBalancesWithCarry.at(-1).effectiveUsCurrentJpy, 822997);
  assert.equal(changed.data.dailyBalancesWithCarry.at(-1).effectiveJpyCnyRate, 0.042);
  assert.equal(changed.data.dailyBalancesWithCarry.at(-1).effectiveFundCurrentCny, 4965.46);
  assert.equal(roundCurrency(changed.totals.usProfit), -5405.82);
});

test("post-market deposit starts participating from the next A-share record", () => {
  const data = {
    assetSnapshots: {
      usStock: { principalJpy: 0, currentAssetJpy: 0, jpyCnyRate: 0.042 },
      fund: { principalCny: 0, currentAssetCny: 0 },
      aShareDaily: [
        { id: "d1", date: "2026-06-01", totalCny: 2100 },
        { id: "d2", date: "2026-06-02", totalCny: 2400 }
      ]
    },
    flows: [
      { id: "f1", date: "2026-06-01", assetType: "ashare", type: "deposit", amount: 1000, timing: "pre", holderType: "person", holderId: "wang" },
      { id: "f2", date: "2026-06-01", assetType: "ashare", type: "deposit", amount: 1000, timing: "post", holderType: "person", holderId: "chen" }
    ]
  };

  const timeline = calculateAshareTimeline(data);
  assert.equal(roundCurrency(timeline.rows[0].allocations.wang), 100);
  assert.equal(roundCurrency(timeline.rows[0].allocations.chen), 0);
  assert.ok(timeline.rows[1].allocations.chen > 0);
});

test("user summary endpoint only returns the logged-in person", async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "returns-mvp-"));
  await fs.cp(path.join(repoRoot, "data"), temporaryDirectory, { recursive: true });

  const app = createApp({ dataDirectory: temporaryDirectory });
  const server = await listen(app);
  const port = server.address().port;

  try {
    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "chen", password: "chen123", scope: "user" })
    });
    assert.equal(login.status, 200);
    const { token } = await login.json();

    const summary = await fetch(`http://127.0.0.1:${port}/api/user/summary`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(summary.status, 200);
    const body = await summary.json();
    assert.deepEqual(Object.keys(body), ["person"]);
    assert.equal(body.person.personId, "chen");
    assert.equal(roundCurrency(body.person.totalProfit), -948.74);
    assert.ok(Math.abs(body.person.cashBalance) < 0.01);
    assert.equal(body.person.fee, 0);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("admin save creates a backup before replacing investment data", async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "returns-mvp-"));
  await fs.cp(path.join(repoRoot, "data"), temporaryDirectory, { recursive: true });

  const app = createApp({ dataDirectory: temporaryDirectory });
  const server = await listen(app);
  const port = server.address().port;

  try {
    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin123", scope: "admin" })
    });
    const { token } = await login.json();
    const dashboard = await fetch(`http://127.0.0.1:${port}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await dashboard.json();
    payload.data.assetSnapshots.fund.currentAssetCny = 5001;

    const save = await fetch(`http://127.0.0.1:${port}/api/admin/data`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ data: payload.data })
    });
    assert.equal(save.status, 200);
    const saveBody = await save.json();
    assert.match(saveBody.backupPath, /investment-data-/);

    const backups = (await fs.readdir(path.join(temporaryDirectory, "backups")))
      .filter((fileName) => fileName.endsWith(".json"));
    assert.equal(backups.length, 1);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});
