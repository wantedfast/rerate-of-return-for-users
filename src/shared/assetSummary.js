function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function calculateAssetSummary(asset = {}) {
  const principal = numberOrZero(asset.totalDeposit) - numberOrZero(asset.totalWithdraw);
  const profitLoss = numberOrZero(asset.currentAsset) - principal;
  return {
    principal,
    profitLoss,
    returnRate: principal === 0 ? 0 : profitLoss / principal
  };
}

export function calculateUserSummary(user = {}) {
  const assetSummaries = Object.values(user.assets ?? {}).map(calculateAssetSummary);
  const totalPrincipal = assetSummaries.reduce((sum, item) => sum + item.principal, 0);
  const totalProfitLoss = assetSummaries.reduce((sum, item) => sum + item.profitLoss, 0);
  return {
    totalPrincipal,
    totalProfitLoss,
    totalReturnRate: totalPrincipal === 0 ? 0 : totalProfitLoss / totalPrincipal
  };
}
