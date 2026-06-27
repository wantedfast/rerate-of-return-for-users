import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { calculateDailyPerformance } from "../src/shared/dailySnapshots.js";
import { appendDailySnapshot, addOneDay, initialDailyAccountAssets } from "../src/shared/dailySnapshotRows.js";

const fixturePath = new URL("../data/investment-data.json", import.meta.url);

async function readFixture() {
  return JSON.parse(await fs.readFile(fixturePath, "utf8"));
}

test("addOneDay increments yyyy-mm-dd without timezone drift", () => {
  assert.equal(addOneDay("2026-06-24"), "2026-06-25");
  assert.equal(addOneDay("2026-12-31"), "2027-01-01");
});

test("appendDailySnapshot creates next immutable row inheriting previous ending assets", async () => {
  const data = await readFixture();
  const previousRows = data.dailySnapshots;
  const nextRows = appendDailySnapshot(previousRows, initialDailyAccountAssets(data));
  const last = previousRows.at(-1);
  const added = nextRows.at(-1);

  assert.equal(previousRows.length, 2);
  assert.equal(nextRows.length, 3);
  assert.notEqual(nextRows, previousRows);
  assert.equal(added.date, "2026-06-25");

  for (const key of ["aShare", "usStock", "fund"]) {
    assert.equal(added[key].beginningAssetsCny, last[key].endingAssetsCny);
    assert.equal(added[key].depositCny, 0);
    assert.equal(added[key].withdrawalCny, 0);
    assert.equal(added[key].endingAssetsCny, last[key].endingAssetsCny);
  }
});

test("appendDailySnapshot creates first row from initial account assets when list is empty", async () => {
  const data = await readFixture();
  const initialAssets = initialDailyAccountAssets(data);
  const rows = appendDailySnapshot([], initialAssets);
  const added = rows.at(-1);

  assert.equal(rows.length, 1);
  assert.match(added.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(added.aShare.beginningAssetsCny, initialAssets.aShare);
  assert.equal(added.aShare.endingAssetsCny, initialAssets.aShare);
  assert.equal(added.usStock.beginningAssetsCny, initialAssets.usStock);
  assert.equal(added.usStock.endingAssetsCny, initialAssets.usStock);
  assert.equal(added.fund.beginningAssetsCny, initialAssets.fund);
  assert.equal(added.fund.endingAssetsCny, initialAssets.fund);
});

test("new default row has zero daily P/L, and editing it recalculates member returns", async () => {
  const data = await readFixture();
  const rowsWithDefault = appendDailySnapshot(data.dailySnapshots, initialDailyAccountAssets(data));
  const defaultRun = calculateDailyPerformance({ ...data, dailySnapshots: rowsWithDefault });
  const defaultLastAccount = defaultRun.accountRows.at(-1);
  const defaultWang = defaultRun.memberSummary.find((row) => row.personId === "wang");

  assert.equal(defaultLastAccount.aShare.dailyPnlCny, 0);
  assert.equal(defaultLastAccount.usStock.dailyPnlCny, 0);
  assert.equal(defaultLastAccount.fund.dailyPnlCny, 0);

  const editedRows = structuredClone(rowsWithDefault);
  editedRows.at(-1).aShare.endingAssetsCny += 100;
  const editedRun = calculateDailyPerformance({ ...data, dailySnapshots: editedRows });
  const editedWang = editedRun.memberSummary.find((row) => row.personId === "wang");

  assert.equal(editedRun.accountRows.at(-1).aShare.dailyPnlCny, 100);
  assert.notEqual(editedWang.totalPnlCny, defaultWang.totalPnlCny);
  assert.notEqual(editedWang.returnRate, defaultWang.returnRate);
});
