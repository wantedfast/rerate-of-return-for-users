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

test("confirmed default data matches accepted totals", async () => {
  const summary = calculateSummary(await readDefaultData());
  const totals = Object.fromEntries(summary.map((row) => [row.personName, roundCurrency(row.totalProfit)]));

  assert.deepEqual(totals, {
    王欣隆: -1433.03,
    chen: -1195.58,
    南京哥: -1673.81,
    garlicm: -71.97,
    糖: -2392.2
  });
});

test("us principal is stored as JPY and converted to CNY capital", async () => {
  const data = await readDefaultData();
  const summary = calculateSummary(data);
  const totals = calculateAll(data).totals;

  assert.equal(data.assetSnapshots.usStock.principalJpy, 970000);
  assert.equal(roundCurrency(totals.usProfit), -5629.05);
  assert.equal(roundCurrency(summary.find((row) => row.personId === "sugar").capital), 18313.5);
});

test("fund current asset only changes common pool fund allocation", async () => {
  const data = await readDefaultData();
  const base = calculateSummary(data);
  const changed = calculateSummary({
    ...data,
    assetSnapshots: {
      ...data.assetSnapshots,
      fund: { ...data.assetSnapshots.fund, currentAssetCny: 5100 }
    }
  });

  for (const personId of ["garlicm", "sugar"]) {
    const before = base.find((row) => row.personId === personId);
    const after = changed.find((row) => row.personId === personId);
    assert.equal(roundCurrency(before.fundProfit), roundCurrency(after.fundProfit));
  }

  assert.notEqual(
    roundCurrency(base.find((row) => row.personId === "wang").fundProfit),
    roundCurrency(changed.find((row) => row.personId === "wang").fundProfit)
  );
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
    assert.equal(roundCurrency(body.person.totalProfit), -1195.58);
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
