import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL("../src/main.jsx", import.meta.url);

test("add daily snapshot button opens modal instead of direct row append", async () => {
  const source = await fs.readFile(sourcePath, "utf8");

  assert.match(source, /onClick=\{\(\) => openDailySnapshotModal\("new"\)\}>新增日期<\/button>/);
  assert.match(source, /新增每日账户记录/);
  assert.match(source, /保存记录/);
  assert.match(source, /查看/);
  assert.match(source, /编辑/);
  assert.match(source, /A股当前总资产 CNY（核对用）/);
  assert.doesNotMatch(source, /newSnapshot\.usStock\.endingAssetsJpy = data\.assetSnapshots\?\.usStock\?\.currentAssetJpy/);
  assert.doesNotMatch(source, /newSnapshot\.fund\.endingAssetsCny = data\.assetSnapshots\?\.fund\?\.currentAssetCny/);
  assert.doesNotMatch(source, /onClick=\{addDailySnapshot\}/);
  assert.doesNotMatch(source, /next\.dailySnapshots\.push/);
  assert.doesNotMatch(source, /className="wide-table"/);
});
