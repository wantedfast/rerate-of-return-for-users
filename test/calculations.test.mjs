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

test("default data derives cash balances, fees, and US liquidation adjustment", async () => {
  const rows = byId(calculateSummary(await readDefaultData()));

  assert.equal(roundCurrency(rows.wang.totalProfit), -2200.12);
  assert.equal(roundCurrency(rows.chen.totalProfit), -1251.22);
  assert.equal(roundCurrency(rows.nanjing.totalProfit), -1751.71);
  assert.equal(roundCurrency(rows.garlicm.totalProfit), -940.77);
  assert.equal(roundCurrency(rows.sugar.totalProfit), -5361.27);

  assert.equal(roundCurrency(rows.garlicm.targetCapital), 20000);
  assert.equal(roundCurrency(rows.garlicm.investedCapital), 19831.71);
  assert.equal(roundCurrency(rows.garlicm.cashBalance), 168.29);
  assert.equal(roundCurrency(rows.garlicm.usProfit), -1928.49);
  assert.equal(rows.garlicm.fee, 100);

  assert.equal(roundCurrency(rows.sugar.targetCapital), 20000);
  assert.equal(roundCurrency(rows.sugar.investedCapital), 19813.5);
  assert.equal(roundCurrency(rows.sugar.cashBalance), 186.5);
  assert.equal(roundCurrency(rows.sugar.usProfit), -5092.2);
  assert.equal(rows.sugar.fee, 200);
});

test("us principal is stored as JPY and converted to CNY capital", async () => {
  const data = await readDefaultData();
  const rows = byId(calculateSummary(data));
  const totals = calculateAll(data).totals;

  assert.equal(data.assetSnapshots.usStock.principalJpy, 1039964.2857142857);
  assert.equal(roundCurrency(totals.usProfit), -10067.55);
  assert.equal(roundCurrency(rows.sugar.capital), 20000);
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
  assert.equal(changed.data.dailyBalancesWithCarry.at(-1).effectiveUsCurrentJpy, 835975);
  assert.equal(changed.data.dailyBalancesWithCarry.at(-1).effectiveJpyCnyRate, 0.042);
  assert.equal(changed.data.dailyBalancesWithCarry.at(-1).effectiveFundCurrentCny, 4965.46);
  assert.equal(roundCurrency(changed.totals.usProfit), -10067.55);
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
    assert.equal(roundCurrency(body.person.totalProfit), -1251.22);
    assert.equal(body.person.cashBalance, 0);
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
