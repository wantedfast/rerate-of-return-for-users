import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { calculateDailyPerformance } from "../src/shared/dailySnapshots.js";
import { roundCurrency } from "../src/shared/calculations.js";

const seedDataPath = new URL("../data/investment-data.json", import.meta.url);

async function loadSeedData() {
  return JSON.parse(await fs.readFile(seedDataPath, "utf8"));
}

test("daily account snapshots calculate account P/L without treating deposits or withdrawals as profit", async () => {
  const result = calculateDailyPerformance(await loadSeedData());
  const first = result.accountRows[0];
  const second = result.accountRows[1];

  assert.equal(roundCurrency(first.aShare.dailyPnlCny), 0);
  assert.equal(roundCurrency(first.usStock.dailyPnlCny), -200);
  assert.equal(roundCurrency(first.fund.dailyPnlCny), -34.54);

  assert.equal(roundCurrency(second.aShare.beginningAssetsCny), 37536.37);
  assert.equal(roundCurrency(second.aShare.transferOutCny), 15757.33);
  assert.equal(roundCurrency(second.aShare.dailyPnlCny), 697);
  assert.equal(roundCurrency(second.usStock.dailyPnlCny), 50);
  assert.equal(roundCurrency(second.fund.dailyPnlCny), 20);

  assert.equal(roundCurrency(second.aShare.cumulativePnlCny), 697);
  assert.equal(roundCurrency(second.usStock.cumulativePnlCny), -150);
  assert.equal(roundCurrency(second.fund.cumulativePnlCny), -14.54);
});

test("editing a historical daily snapshot recalculates following beginning assets and cumulative member P/L", async () => {
  const data = await loadSeedData();
  const changed = structuredClone(data);
  changed.dailySnapshots[0].aShare.endingAssetsCny += 1000;

  const base = calculateDailyPerformance(data);
  const result = calculateDailyPerformance(changed);

  assert.equal(roundCurrency(result.accountRows[0].aShare.dailyPnlCny), 1000);
  assert.equal(roundCurrency(result.accountRows[1].aShare.beginningAssetsCny), 38536.37);
  assert.equal(roundCurrency(result.accountRows[1].aShare.dailyPnlCny), -303);
  assert.equal(roundCurrency(result.accountRows[1].aShare.cumulativePnlCny), 697);
  assert.equal(roundCurrency(result.memberSummary[0].totalPnlCny), roundCurrency(base.memberSummary[0].totalPnlCny));
});

test("date order changes are calculated by sorted snapshot date order", async () => {
  const data = await loadSeedData();
  const changed = structuredClone(data);
  changed.dailySnapshots = [
    {
      date: "2026-06-25",
      aShare: { endingAssetsCny: 22500 },
      usStock: { endingAssetsCny: 43700.09 },
      fund: { endingAssetsCny: 4985.46 }
    },
    {
      date: "2026-06-24",
      aShare: { externalDepositCny: 0, externalWithdrawalCny: 0, transferInCny: 0, transferOutCny: 15757.33, endingAssetsCny: 22476.04 },
      usStock: { withdrawalCny: 500, endingAssetsCny: 43700.09 },
      fund: { endingAssetsCny: 4985.46 }
    }
  ];

  const result = calculateDailyPerformance(changed);

  assert.deepEqual(result.accountRows.map((row) => row.date), ["2026-06-24", "2026-06-25"]);
  assert.equal(roundCurrency(result.accountRows[0].aShare.dailyPnlCny), 697);
  assert.equal(roundCurrency(result.accountRows[1].aShare.beginningAssetsCny), 22476.04);
  assert.equal(roundCurrency(result.accountRows[1].aShare.dailyPnlCny), 23.96);
});

test("daily member allocation follows A-share, U.S. stock, and fund ownership rules", async () => {
  const result = calculateDailyPerformance(await loadSeedData());
  const wangCurrent = result.memberDailyRows.find((row) => row.date === "2026-06-24" && row.personId === "wang");
  const chenCurrent = result.memberDailyRows.find((row) => row.date === "2026-06-24" && row.personId === "chen");
  const sugarCurrent = result.memberDailyRows.find((row) => row.date === "2026-06-24" && row.personId === "sugar");

  assert.equal(roundCurrency(wangCurrent.aShareDailyPnlCny), 262.49);
  assert.equal(roundCurrency(wangCurrent.usStockDailyPnlCny), 9.61);
  assert.equal(roundCurrency(wangCurrent.fundDailyPnlCny), 20);

  assert.equal(roundCurrency(chenCurrent.aShareDailyPnlCny), 92.84);
  assert.equal(roundCurrency(chenCurrent.usStockDailyPnlCny), 3.4);
  assert.equal(roundCurrency(chenCurrent.fundDailyPnlCny), 0);

  assert.equal(roundCurrency(sugarCurrent.aShareDailyPnlCny), 26);
  assert.equal(roundCurrency(sugarCurrent.usStockDailyPnlCny), 20.92);
  assert.equal(roundCurrency(sugarCurrent.fundDailyPnlCny), 0);
});
