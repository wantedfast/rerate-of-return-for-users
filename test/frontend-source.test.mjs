import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL("../src/main.jsx", import.meta.url);

test("admin page uses modal daily entry, compact daily table, and fixed allocation modules", async () => {
  const source = await fs.readFile(sourcePath, "utf8");

  assert.match(source, /每日账户录入/);
  assert.match(source, /DailySnapshotModal/);
  assert.match(source, /import \{ calculateAll \} from "\.\/shared\/calculations\.js";/);
  assert.match(source, /const rows = useMemo\(\(\) => data \? calculateAll\(data\)\.summary : \[\], \[data\]\)/);
  assert.match(source, /syncFigure2InputsFromDailySnapshot/);
  assert.match(source, /upsertDailyBalance/);
  assert.match(source, /data\.assetSnapshots\.usStock\.floatingPnlJpy = rate/);
  assert.match(source, /import \{ inputNumberValue, isDecimalInputText \} from "\.\/shared\/formInputValues\.js";/);
  assert.match(source, /if \(!isDecimalInputText\(value\)\)/);
  assert.match(source, /A股当前总资产 CNY（核对用）<input type="text" inputMode="decimal" disabled=\{readOnly\} value=\{inputNumberValue\(draft\.aShare\.endingAssetsCny, \{ emptyZero: true \}\)\}/);
  assert.match(source, /JPY\/CNY 汇率<input type="text" inputMode="decimal" disabled=\{readOnly\} value=\{inputNumberValue\(draft\.usStock\.jpyToCnyRate\)\}/);
  assert.match(source, /\[field\]: value/);
  assert.match(source, /openDailySnapshotModal/);
  assert.match(source, /onClick=\{\(\) => openDailySnapshotModal\("new"\)\}/);
  assert.match(source, /saveDailySnapshotModal/);
  assert.match(source, /新增每日账户记录/);
  assert.match(source, /A股当前总资产 CNY（核对用）/);
  assert.match(source, /A股调仓后留存成本 CNY/);
  assert.match(source, /美股当前总资产 JPY/);
  assert.match(source, /JPY\/CNY 汇率/);
  assert.match(source, /查看/);
  assert.match(source, /编辑/);
  assert.match(source, /删除/);
  assert.match(source, /buildFixedAllocationRows/);
  assert.match(source, /fixedAllocationRows/);
  assert.doesNotMatch(source, /成员收益汇总/);
  assert.doesNotMatch(source, /成员盈亏汇总/);
  assert.doesNotMatch(source, /成员每日明细/);
  assert.doesNotMatch(source, /累计净入金/);
  assert.doesNotMatch(source, /当前分摊资产/);
  assert.doesNotMatch(source, /dailySummaryRows/);
  assert.doesNotMatch(source, /onClick=\{addDailySnapshot\}/);
  assert.doesNotMatch(source, /next\.dailySnapshots\.push/);
  assert.doesNotMatch(source, /className="wide-table"/);
  assert.doesNotMatch(source, /allocation-bar/);
  assert.doesNotMatch(source, /\["assetSnapshots", "usStock", "earlyRealizedOwnerId"\]/);
  assert.doesNotMatch(source, /calculations\?\.summary/);
});
