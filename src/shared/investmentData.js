export class InvestmentDataValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvestmentDataValidationError";
  }
}

function fail(message) {
  throw new InvestmentDataValidationError(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label} must be a non-empty string`);
  }
}

function assertNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
}

function assertOptionalNumber(value, label) {
  if (value !== undefined) {
    assertNumber(value, label);
  }
}

function assertDateString(value, label) {
  assertString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`${label} must use YYYY-MM-DD format`);
  }
}

function assertNumberMap(value, label, knownIds, options = {}) {
  assertPlainObject(value, label);
  for (const [key, entry] of Object.entries(value)) {
    if (!knownIds.has(key)) {
      fail(`${label} contains unknown person id ${key}`);
    }
    assertNumber(entry, `${label}.${key}`);
  }

  if (options.requireAllKeys) {
    for (const id of knownIds) {
      if (!Object.hasOwn(value, id)) {
        fail(`${label} is missing person id ${id}`);
      }
    }
  }
}

function assertStringMap(value, label, knownIds) {
  assertPlainObject(value, label);
  for (const [key, entry] of Object.entries(value)) {
    if (!knownIds.has(key)) {
      fail(`${label} contains unknown person id ${key}`);
    }
    assertString(entry, `${label}.${key}`);
  }
}

function assertUniqueStrings(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      fail(`${label} contains duplicate value ${value}`);
    }
    seen.add(value);
  }
}

export function listPersonIds(data) {
  return (data.people ?? []).map((person) => person.id);
}

export function blankByPerson(data, initialValue = 0) {
  return Object.fromEntries(listPersonIds(data).map((id) => [id, initialValue]));
}

export function validateInvestmentData(data) {
  assertPlainObject(data, "data");

  if (!Array.isArray(data.people) || data.people.length === 0) {
    fail("people must be a non-empty array");
  }

  const personIds = [];
  for (const [index, person] of data.people.entries()) {
    assertPlainObject(person, `people[${index}]`);
    assertString(person.id, `people[${index}].id`);
    assertString(person.name, `people[${index}].name`);
    assertString(person.password, `people[${index}].password`);
    personIds.push(person.id);
  }

  assertUniqueStrings(personIds, "people ids");
  const knownIds = new Set(personIds);

  assertPlainObject(data.admin, "admin");
  assertString(data.admin.username, "admin.username");
  assertString(data.admin.password, "admin.password");

  assertPlainObject(data.assetSnapshots, "assetSnapshots");
  assertPlainObject(data.assetSnapshots.ashare, "assetSnapshots.ashare");
  assertNumberMap(data.assetSnapshots.ashare.openingCapitalCny ?? {}, "assetSnapshots.ashare.openingCapitalCny", knownIds, { requireAllKeys: true });
  assertDateString(data.assetSnapshots.ashare.commonPoolToUsStockDate, "assetSnapshots.ashare.commonPoolToUsStockDate");
  assertNumber(data.assetSnapshots.ashare.commonPoolToUsStockCny, "assetSnapshots.ashare.commonPoolToUsStockCny");
  if (data.assetSnapshots.ashare.specialPrincipalCny !== undefined) {
    assertNumberMap(data.assetSnapshots.ashare.specialPrincipalCny, "assetSnapshots.ashare.specialPrincipalCny", knownIds);
  }
  if (data.assetSnapshots.ashare.commonPoolPersonIds !== undefined) {
    if (!Array.isArray(data.assetSnapshots.ashare.commonPoolPersonIds)) {
      fail("assetSnapshots.ashare.commonPoolPersonIds must be an array");
    }
    for (const [index, id] of data.assetSnapshots.ashare.commonPoolPersonIds.entries()) {
      assertString(id, `assetSnapshots.ashare.commonPoolPersonIds[${index}]`);
      if (!knownIds.has(id)) {
        fail(`assetSnapshots.ashare.commonPoolPersonIds[${index}] must be a known person`);
      }
    }
    assertUniqueStrings(data.assetSnapshots.ashare.commonPoolPersonIds, "assetSnapshots.ashare.commonPoolPersonIds");
  }

  const usStock = data.assetSnapshots.usStock;
  assertPlainObject(usStock, "assetSnapshots.usStock");
  assertNumber(usStock.principalJpy, "assetSnapshots.usStock.principalJpy");
  assertNumber(usStock.currentAssetJpy, "assetSnapshots.usStock.currentAssetJpy");
  assertNumber(usStock.earlyRealizedPnlJpy, "assetSnapshots.usStock.earlyRealizedPnlJpy");
  assertNumber(usStock.laterRealizedPnlJpy, "assetSnapshots.usStock.laterRealizedPnlJpy");
  assertNumber(usStock.floatingPnlJpy, "assetSnapshots.usStock.floatingPnlJpy");
  assertNumber(usStock.jpyCnyRate, "assetSnapshots.usStock.jpyCnyRate");
  assertNumberMap(usStock.currentCapitalByPersonCny ?? {}, "assetSnapshots.usStock.currentCapitalByPersonCny", knownIds, { requireAllKeys: true });

  const fund = data.assetSnapshots.fund;
  assertPlainObject(fund, "assetSnapshots.fund");
  assertString(fund.ownerId, "assetSnapshots.fund.ownerId");
  if (!knownIds.has(fund.ownerId)) {
    fail(`assetSnapshots.fund.ownerId must be a known person`);
  }
  assertNumber(fund.principalCny, "assetSnapshots.fund.principalCny");
  assertNumber(fund.currentAssetCny, "assetSnapshots.fund.currentAssetCny");

  if (!Array.isArray(data.dailyBalances)) {
    fail("dailyBalances must be an array");
  }
  const dailyIds = [];
  for (const [index, row] of data.dailyBalances.entries()) {
    assertPlainObject(row, `dailyBalances[${index}]`);
    assertString(row.id, `dailyBalances[${index}].id`);
    assertDateString(row.date, `dailyBalances[${index}].date`);
    assertNumber(row.ashareProfitCny, `dailyBalances[${index}].ashareProfitCny`);
    dailyIds.push(row.id);
  }
  assertUniqueStrings(dailyIds, "dailyBalances ids");

  if (data.dailySnapshots !== undefined) {
    if (!Array.isArray(data.dailySnapshots)) {
      fail("dailySnapshots must be an array");
    }
    const snapshotDates = [];
    for (const [index, snapshot] of data.dailySnapshots.entries()) {
      assertPlainObject(snapshot, `dailySnapshots[${index}]`);
      assertDateString(snapshot.date, `dailySnapshots[${index}].date`);
      snapshotDates.push(snapshot.date);
      for (const assetKey of ["aShare", "usStock", "fund"]) {
        assertPlainObject(snapshot[assetKey], `dailySnapshots[${index}].${assetKey}`);
        assertOptionalNumber(snapshot[assetKey].beginningAssetsCny, `dailySnapshots[${index}].${assetKey}.beginningAssetsCny`);
        assertOptionalNumber(snapshot[assetKey].beginningAssetsJpy, `dailySnapshots[${index}].${assetKey}.beginningAssetsJpy`);
        assertOptionalNumber(snapshot[assetKey].depositCny, `dailySnapshots[${index}].${assetKey}.depositCny`);
        assertOptionalNumber(snapshot[assetKey].withdrawalCny, `dailySnapshots[${index}].${assetKey}.withdrawalCny`);
        assertOptionalNumber(snapshot[assetKey].externalDepositCny, `dailySnapshots[${index}].${assetKey}.externalDepositCny`);
        assertOptionalNumber(snapshot[assetKey].externalWithdrawalCny, `dailySnapshots[${index}].${assetKey}.externalWithdrawalCny`);
        assertOptionalNumber(snapshot[assetKey].externalDepositJpy, `dailySnapshots[${index}].${assetKey}.externalDepositJpy`);
        assertOptionalNumber(snapshot[assetKey].externalWithdrawalJpy, `dailySnapshots[${index}].${assetKey}.externalWithdrawalJpy`);
        assertOptionalNumber(snapshot[assetKey].transferInCny, `dailySnapshots[${index}].${assetKey}.transferInCny`);
        assertOptionalNumber(snapshot[assetKey].transferOutCny, `dailySnapshots[${index}].${assetKey}.transferOutCny`);
        assertOptionalNumber(snapshot[assetKey].transferInJpy, `dailySnapshots[${index}].${assetKey}.transferInJpy`);
        assertOptionalNumber(snapshot[assetKey].transferOutJpy, `dailySnapshots[${index}].${assetKey}.transferOutJpy`);
        assertOptionalNumber(snapshot[assetKey].jpyToCnyRate, `dailySnapshots[${index}].${assetKey}.jpyToCnyRate`);
        assertOptionalNumber(snapshot[assetKey].endingAssetsCny, `dailySnapshots[${index}].${assetKey}.endingAssetsCny`);
        assertOptionalNumber(snapshot[assetKey].endingAssetsJpy, `dailySnapshots[${index}].${assetKey}.endingAssetsJpy`);
      }
    }
    assertUniqueStrings(snapshotDates, "dailySnapshots dates");
  }

  if (!Array.isArray(data.flows)) {
    fail("flows must be an array");
  }
  const flowIds = [];
  for (const [index, flow] of data.flows.entries()) {
    assertPlainObject(flow, `flows[${index}]`);
    assertString(flow.id, `flows[${index}].id`);
    assertDateString(flow.date, `flows[${index}].date`);
    assertString(flow.asset, `flows[${index}].asset`);
    if (flow.asset !== "ashare") {
      fail(`flows[${index}].asset must be ashare`);
    }
    assertString(flow.personId, `flows[${index}].personId`);
    if (flow.personId !== "common" && !knownIds.has(flow.personId)) {
      fail(`flows[${index}].personId must be a known person or common`);
    }
    assertNumber(flow.amountCny, `flows[${index}].amountCny`);
    if (flow.timing !== "pre" && flow.timing !== "post") {
      fail(`flows[${index}].timing must be pre or post`);
    }
    flowIds.push(flow.id);
  }
  assertUniqueStrings(flowIds, "flows ids");

  assertNumberMap(data.cashBalances ?? {}, "cashBalances", knownIds, { requireAllKeys: true });
  assertNumberMap(data.fees ?? {}, "fees", knownIds, { requireAllKeys: true });
  if (data.fixedAllocationLabels !== undefined) {
    assertStringMap(data.fixedAllocationLabels, "fixedAllocationLabels", knownIds);
  }

  return data;
}
