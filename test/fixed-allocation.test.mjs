import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { buildFixedAllocationRows } from "../src/shared/fixedAllocation.js";

const sourcePath = new URL("../data/investment-data.json", import.meta.url);

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundRate(value) {
  return Math.round((Number(value) * 100 + Number.EPSILON) * 100) / 100;
}

test("fixed principal allocation table matches the confirmed common-pool and U.S. stock basis", async () => {
  const data = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  const rows = buildFixedAllocationRows(data, data.people);
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

  assert.deepEqual(rows.map((row) => row.id), ["common-pool-total", "wang", "chen", "nanjing", "garlicm", "sugar"]);
  assert.deepEqual(rows.map((row) => row.name), ["三人共同池", "Wang", "Chen", "Nanjing", "Garlicm", "Sugar/Tang"]);

  assert.equal(roundMoney(byId["common-pool-total"].commonInitialPrincipal), 26136.37);
  assert.equal(roundRate(byId["common-pool-total"].commonPoolRatio), 100);
  assert.equal(roundMoney(byId["common-pool-total"].preTransferAsharePnl), -6750);
  assert.equal(roundMoney(byId["common-pool-total"].preTransferCommonPoolValue), 19386.37);
  assert.equal(roundMoney(byId["common-pool-total"].commonPoolToUsStockCny), 15757.33);
  assert.equal(roundMoney(byId["common-pool-total"].transferredUsPrincipal), 15757.33);
  assert.equal(roundMoney(byId["common-pool-total"].retainedAshareEquity), 3629.04);
  assert.equal(roundMoney(byId["common-pool-total"].specialASharePrincipal), 0);
  assert.equal(roundMoney(byId["common-pool-total"].usPrincipal), 15757.33);
  assert.equal(roundRate(byId["common-pool-total"].usRatio), 35.53);
  assert.equal(byId["common-pool-total"].note, "三人共同池总账户");

  assert.equal(roundMoney(byId.wang.commonInitialPrincipal), 14136.37);
  assert.equal(roundRate(byId.wang.commonPoolRatio), 54.09);
  assert.equal(roundMoney(byId.wang.preTransferAsharePnl), -3650.87);
  assert.equal(roundMoney(byId.wang.preTransferCommonPoolValue), 10485.5);
  assert.equal(roundMoney(byId.wang.commonPoolToUsStockCny), 8522.66);
  assert.equal(roundMoney(byId.wang.transferredUsPrincipal), 8522.66);
  assert.equal(roundMoney(byId.wang.retainedAshareEquity), 1962.84);
  assert.equal(roundMoney(byId.wang.usPrincipal), 8522.66);
  assert.equal(roundRate(byId.wang.usRatio), 19.22);

  assert.equal(roundMoney(byId.chen.commonInitialPrincipal), 5000);
  assert.equal(roundRate(byId.chen.commonPoolRatio), 19.13);
  assert.equal(roundMoney(byId.chen.preTransferAsharePnl), -1291.3);
  assert.equal(roundMoney(byId.chen.preTransferCommonPoolValue), 3708.7);
  assert.equal(roundMoney(byId.chen.commonPoolToUsStockCny), 3014.45);
  assert.equal(roundMoney(byId.chen.transferredUsPrincipal), 3014.45);
  assert.equal(roundMoney(byId.chen.retainedAshareEquity), 694.25);
  assert.equal(roundMoney(byId.chen.usPrincipal), 3014.45);
  assert.equal(roundRate(byId.chen.usRatio), 6.8);

  assert.equal(roundMoney(byId.nanjing.commonInitialPrincipal), 7000);
  assert.equal(roundRate(byId.nanjing.commonPoolRatio), 26.78);
  assert.equal(roundMoney(byId.nanjing.preTransferAsharePnl), -1807.83);
  assert.equal(roundMoney(byId.nanjing.preTransferCommonPoolValue), 5192.17);
  assert.equal(roundMoney(byId.nanjing.commonPoolToUsStockCny), 4220.22);
  assert.equal(roundMoney(byId.nanjing.transferredUsPrincipal), 4220.22);
  assert.equal(roundMoney(byId.nanjing.retainedAshareEquity), 971.95);
  assert.equal(roundMoney(byId.nanjing.usPrincipal), 4220.22);
  assert.equal(roundRate(byId.nanjing.usRatio), 9.52);

  assert.equal(roundMoney(byId.garlicm.commonInitialPrincipal), 0);
  assert.equal(roundRate(byId.garlicm.commonPoolRatio), 0);
  assert.equal(roundMoney(byId.garlicm.commonPoolToUsStockCny), 0);
  assert.equal(roundMoney(byId.garlicm.transferredUsPrincipal), 10036.76);
  assert.equal(roundMoney(byId.garlicm.specialASharePrincipal), 10000);
  assert.equal(roundMoney(byId.garlicm.usPrincipal), 10036.76);
  assert.equal(roundRate(byId.garlicm.usRatio), 22.63);

  assert.equal(roundMoney(byId.sugar.commonInitialPrincipal), 0);
  assert.equal(roundRate(byId.sugar.commonPoolRatio), 0);
  assert.equal(roundMoney(byId.sugar.commonPoolToUsStockCny), 0);
  assert.equal(roundMoney(byId.sugar.transferredUsPrincipal), 18556);
  assert.equal(roundMoney(byId.sugar.specialASharePrincipal), 1400);
  assert.equal(roundMoney(byId.sugar.usPrincipal), 18556);
  assert.equal(roundRate(byId.sugar.usRatio), 41.84);
});

test("common-pool U.S. principal uses the explicit transfer amount instead of saved per-person U.S. capital", async () => {
  const data = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  const changed = structuredClone(data);
  changed.assetSnapshots.ashare.commonPoolToUsStockCny = 12000;
  changed.assetSnapshots.usStock.currentCapitalByPersonCny.wang = 1;
  changed.assetSnapshots.usStock.currentCapitalByPersonCny.chen = 2;
  changed.assetSnapshots.usStock.currentCapitalByPersonCny.nanjing = 3;

  const rows = buildFixedAllocationRows(changed, changed.people);
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

  assert.equal(roundMoney(byId["common-pool-total"].transferredUsPrincipal), 12000);
  assert.equal(roundMoney(byId.wang.transferredUsPrincipal), 6490.44);
  assert.equal(roundMoney(byId.chen.transferredUsPrincipal), 2295.65);
  assert.equal(roundMoney(byId.nanjing.transferredUsPrincipal), 3213.91);
  assert.equal(roundMoney(byId.wang.transferredUsPrincipal + byId.chen.transferredUsPrincipal + byId.nanjing.transferredUsPrincipal), 12000);

  assert.notEqual(roundMoney(byId.wang.transferredUsPrincipal), 1);
  assert.notEqual(roundMoney(byId.chen.transferredUsPrincipal), 2);
  assert.notEqual(roundMoney(byId.nanjing.transferredUsPrincipal), 3);
});
