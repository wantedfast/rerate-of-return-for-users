function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatDateUtc(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function todayLocalDate() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

export function addOneDay(dateText) {
  if (!dateText) {
    return todayLocalDate();
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) {
    return todayLocalDate();
  }

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1));
  return formatDateUtc(date);
}

export function createFlatDailySnapshot(date, beginningAssets = {}) {
  const aShareBeginning = numberOrZero(beginningAssets.aShare);
  const usStockBeginning = numberOrZero(beginningAssets.usStock);
  const fundBeginning = numberOrZero(beginningAssets.fund);

  return {
    date,
    aShare: {
      beginningAssetsCny: aShareBeginning,
      depositCny: 0,
      withdrawalCny: 0,
      externalDepositCny: 0,
      externalWithdrawalCny: 0,
      transferInCny: 0,
      transferOutCny: 0,
      endingAssetsCny: aShareBeginning
    },
    usStock: {
      beginningAssetsCny: usStockBeginning,
      depositCny: 0,
      withdrawalCny: 0,
      externalDepositJpy: 0,
      externalWithdrawalJpy: 0,
      transferInJpy: 0,
      transferOutJpy: 0,
      jpyToCnyRate: 0.042,
      endingAssetsCny: usStockBeginning
    },
    fund: {
      beginningAssetsCny: fundBeginning,
      depositCny: 0,
      withdrawalCny: 0,
      externalDepositCny: 0,
      externalWithdrawalCny: 0,
      transferInCny: 0,
      transferOutCny: 0,
      endingAssetsCny: fundBeginning
    }
  };
}

export function calculateAShareBasis(data) {
  const commonIds = data.assetSnapshots?.ashare?.commonPoolPersonIds ?? [];
  const opening = data.assetSnapshots?.ashare?.openingCapitalCny ?? {};
  const special = data.assetSnapshots?.ashare?.specialPrincipalCny ?? {};
  const originalTotalCapitalCny =
    commonIds.reduce((sum, id) => sum + numberOrZero(opening[id]), 0)
    + Object.entries(special).reduce((sum, [, value]) => sum + numberOrZero(value), 0);
  const transferredToUsStockCny = numberOrZero(data.assetSnapshots?.ashare?.commonPoolToUsStockCny);
  const remainingCostBasisCny = originalTotalCapitalCny - transferredToUsStockCny;

  return {
    originalTotalCapitalCny,
    transferredToUsStockCny,
    remainingCostBasisCny
  };
}

export function initialDailyAccountAssets(data) {
  const commonIds = data.assetSnapshots?.ashare?.commonPoolPersonIds ?? [];
  const opening = data.assetSnapshots?.ashare?.openingCapitalCny ?? {};
  const special = data.assetSnapshots?.ashare?.specialPrincipalCny ?? {};
  const usCapital = data.assetSnapshots?.usStock?.currentCapitalByPersonCny ?? {};

  return {
    aShare:
      commonIds.reduce((sum, id) => sum + numberOrZero(opening[id]), 0)
      + Object.entries(special).reduce((sum, [, value]) => sum + numberOrZero(value), 0),
    usStock:
      numberOrZero(data.assetSnapshots?.ashare?.commonPoolToUsStockCny)
      + Object.entries(usCapital)
        .filter(([id]) => !commonIds.includes(id))
        .reduce((sum, [, value]) => sum + numberOrZero(value), 0),
    fund: numberOrZero(data.assetSnapshots?.fund?.principalCny)
  };
}

export function appendDailySnapshot(previousRows, initialBeginningAssets = {}) {
  const rows = Array.isArray(previousRows) ? previousRows : [];
  const last = rows.at(-1);
  const beginningAssets = last
    ? {
        aShare: last.aShare?.endingAssetsCny,
        usStock: last.usStock?.endingAssetsCny,
        fund: last.fund?.endingAssetsCny
      }
    : initialBeginningAssets;

  return [
    ...rows,
    createFlatDailySnapshot(addOneDay(last?.date), beginningAssets)
  ];
}

export function sortDailySnapshotsByDate(rows) {
  return [...(rows ?? [])].sort((a, b) => a.date.localeCompare(b.date));
}
