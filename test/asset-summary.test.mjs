import assert from "node:assert/strict";
import test from "node:test";
import { calculateAssetSummary, calculateUserSummary } from "../src/shared/assetSummary.js";
import { roundCurrency } from "../src/calculations.js";

test("deposit is principal, not profit", () => {
  const summary = calculateAssetSummary({
    totalDeposit: 1500,
    totalWithdraw: 0,
    currentAsset: 1500
  });

  assert.equal(summary.principal, 1500);
  assert.equal(summary.profitLoss, 0);
  assert.equal(summary.returnRate, 0);
});

test("asset profit is current asset minus net principal", () => {
  const summary = calculateAssetSummary({
    totalDeposit: 1500,
    totalWithdraw: 0,
    currentAsset: 1600
  });

  assert.equal(summary.principal, 1500);
  assert.equal(summary.profitLoss, 100);
  assert.equal(roundCurrency(summary.returnRate * 100), 6.67);
});

test("asset loss is current asset minus net principal", () => {
  const summary = calculateAssetSummary({
    totalDeposit: 1500,
    totalWithdraw: 0,
    currentAsset: 1200
  });

  assert.equal(summary.principal, 1500);
  assert.equal(summary.profitLoss, -300);
  assert.equal(roundCurrency(summary.returnRate * 100), -20);
});

test("withdrawal reduces principal and is not a loss", () => {
  const summary = calculateAssetSummary({
    totalDeposit: 5000,
    totalWithdraw: 1000,
    currentAsset: 4000
  });

  assert.equal(summary.principal, 4000);
  assert.equal(summary.profitLoss, 0);
  assert.equal(summary.returnRate, 0);
});

test("user summary aggregates principal and profit across assets", () => {
  const summary = calculateUserSummary({
    assets: {
      aStock: { totalDeposit: 1000, totalWithdraw: 0, currentAsset: 900 },
      usStock: { totalDeposit: 2000, totalWithdraw: 0, currentAsset: 2300 },
      fund: { totalDeposit: 1500, totalWithdraw: 0, currentAsset: 1500 }
    }
  });

  assert.equal(summary.totalPrincipal, 4500);
  assert.equal(summary.totalProfitLoss, 200);
  assert.equal(roundCurrency(summary.totalReturnRate * 100), 4.44);
});
