import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { calculateDailyPerformance } from "../src/shared/dailySnapshots.js";
import { calculateAShareBasis } from "../src/shared/dailySnapshotRows.js";
import { roundCurrency } from "../src/shared/calculations.js";

const seedDataPath = new URL("../data/investment-data.json", import.meta.url);

async function loadSeedData() {
  return JSON.parse(await fs.readFile(seedDataPath, "utf8"));
}

test("A-share current P/L uses post-transfer remaining cost basis, not gross original capital", async () => {
  const data = await loadSeedData();
  const basis = calculateAShareBasis(data);
  const currentAssets = data.assetSnapshots.ashare.currentTotalAssetsCny;

  assert.equal(roundCurrency(basis.originalTotalCapitalCny), 37536.37);
  assert.equal(roundCurrency(basis.transferredToUsStockCny), 15757.33);
  assert.equal(roundCurrency(basis.remainingCostBasisCny), 21779.04);
  assert.equal(roundCurrency(currentAssets - basis.remainingCostBasisCny), 697);
  assert.notEqual(roundCurrency(currentAssets - basis.originalTotalCapitalCny), 697);
});

test("A-share transfer out is not treated as a trading loss in daily snapshot P/L", async () => {
  const data = await loadSeedData();
  const result = calculateDailyPerformance(data);
  const current = result.accountRows.find((row) => row.date === "2026-06-24");

  assert.equal(roundCurrency(current.aShare.beginningAssetsCny), 37536.37);
  assert.equal(roundCurrency(current.aShare.transferOutCny), 15757.33);
  assert.equal(roundCurrency(current.aShare.endingAssetsCny), 22476.04);
  assert.equal(roundCurrency(current.aShare.dailyPnlCny), 697);
});
