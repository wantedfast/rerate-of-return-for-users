import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { calculateAll } from "./shared/calculations.js";
import { calculateDailyPerformance } from "./shared/dailySnapshots.js";
import { appendDailySnapshot, calculateAShareBasis, initialDailyAccountAssets, sortDailySnapshotsByDate } from "./shared/dailySnapshotRows.js";
import { buildFixedAllocationRows } from "./shared/fixedAllocation.js";
import { inputNumberValue, isDecimalInputText } from "./shared/formInputValues.js";
import "./styles.css";

const isAdminRoute = window.location.pathname.startsWith("/admin");
const sessionStorageKey = isAdminRoute ? "investment-returns-admin-token" : "investment-returns-user-token";
const legacyAdminDraftStorageKeys = [
  "investment-returns-admin-draft",
  "investment-returns-admin-draft-excel-source-v1",
  "investment-returns-admin-draft-principal-fix-v2",
  "investment-returns-admin-draft-fixed-allocation-v3",
  "investment-returns-admin-draft-fixed-allocation-v4",
  "investment-returns-admin-draft-transfer-basis-v5",
  "investment-returns-admin-draft-daily-snapshots-v6",
  "investment-returns-admin-draft-daily-add-v7",
  "investment-returns-admin-draft-daily-add-v8",
  "investment-returns-admin-draft-modal-v9"
];
const adminDraftStorageKey = "investment-returns-admin-draft-modal-defaults-v10";

function money(value, digits = 2) {
  return Number(value ?? 0).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function percent(value) {
  return `${(Number(value ?? 0) * 100).toFixed(2)}%`;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function valueClass(value) {
  return numberOrZero(value) < 0 ? "negative" : "positive";
}

function normalizeDailySnapshotForForm(snapshot, data) {
  const rate = numberOrZero(snapshot.usStock?.jpyToCnyRate ?? data.assetSnapshots?.usStock?.jpyCnyRate);
  const usEndingAssetsJpy = numberOrZero(snapshot.usStock?.endingAssetsJpy);
  const usEndingAssetsCny = numberOrZero(snapshot.usStock?.endingAssetsCny);
  return {
    date: snapshot.date,
    aShare: {
      externalDepositCny: numberOrZero(snapshot.aShare?.externalDepositCny ?? snapshot.aShare?.depositCny),
      externalWithdrawalCny: numberOrZero(snapshot.aShare?.externalWithdrawalCny ?? snapshot.aShare?.withdrawalCny),
      transferInCny: numberOrZero(snapshot.aShare?.transferInCny),
      transferOutCny: numberOrZero(snapshot.aShare?.transferOutCny),
      endingAssetsCny: numberOrZero(snapshot.aShare?.endingAssetsCny)
    },
    usStock: {
      externalDepositJpy: numberOrZero(snapshot.usStock?.externalDepositJpy),
      externalWithdrawalJpy: numberOrZero(snapshot.usStock?.externalWithdrawalJpy),
      transferInJpy: numberOrZero(snapshot.usStock?.transferInJpy),
      transferOutJpy: numberOrZero(snapshot.usStock?.transferOutJpy),
      endingAssetsJpy: usEndingAssetsJpy || (rate ? usEndingAssetsCny / rate : 0),
      jpyToCnyRate: rate || 0.042
    },
    fund: {
      externalDepositCny: numberOrZero(snapshot.fund?.externalDepositCny ?? snapshot.fund?.depositCny),
      externalWithdrawalCny: numberOrZero(snapshot.fund?.externalWithdrawalCny ?? snapshot.fund?.withdrawalCny),
      transferInCny: numberOrZero(snapshot.fund?.transferInCny),
      transferOutCny: numberOrZero(snapshot.fund?.transferOutCny),
      endingAssetsCny: numberOrZero(snapshot.fund?.endingAssetsCny)
    }
  };
}

function serializeDailySnapshotDraft(draft) {
  return {
    date: draft.date,
    aShare: {
      externalDepositCny: numberOrZero(draft.aShare.externalDepositCny),
      externalWithdrawalCny: numberOrZero(draft.aShare.externalWithdrawalCny),
      transferInCny: numberOrZero(draft.aShare.transferInCny),
      transferOutCny: numberOrZero(draft.aShare.transferOutCny),
      endingAssetsCny: numberOrZero(draft.aShare.endingAssetsCny)
    },
    usStock: {
      externalDepositJpy: numberOrZero(draft.usStock.externalDepositJpy),
      externalWithdrawalJpy: numberOrZero(draft.usStock.externalWithdrawalJpy),
      transferInJpy: numberOrZero(draft.usStock.transferInJpy),
      transferOutJpy: numberOrZero(draft.usStock.transferOutJpy),
      endingAssetsJpy: numberOrZero(draft.usStock.endingAssetsJpy),
      jpyToCnyRate: numberOrZero(draft.usStock.jpyToCnyRate)
    },
    fund: {
      externalDepositCny: numberOrZero(draft.fund.externalDepositCny),
      externalWithdrawalCny: numberOrZero(draft.fund.externalWithdrawalCny),
      transferInCny: numberOrZero(draft.fund.transferInCny),
      transferOutCny: numberOrZero(draft.fund.transferOutCny),
      endingAssetsCny: numberOrZero(draft.fund.endingAssetsCny)
    }
  };
}

function buildPreviewData(data, draft, index) {
  const next = structuredClone(data);
  const snapshot = serializeDailySnapshotDraft(draft);
  next.dailySnapshots = next.dailySnapshots ?? [];
  if (index === null) {
    next.dailySnapshots = sortDailySnapshotsByDate([...next.dailySnapshots, snapshot]);
  } else {
    next.dailySnapshots[index] = snapshot;
    next.dailySnapshots = sortDailySnapshotsByDate(next.dailySnapshots);
  }
  return next;
}

function upsertDailyBalance(rows, date, ashareProfitCny) {
  const nextRows = [...(rows ?? [])];
  const existingIndex = nextRows.findIndex((row) => row.date === date);
  const nextRow = {
    id: existingIndex >= 0 ? nextRows[existingIndex].id : `d-${date}`,
    date,
    ashareProfitCny
  };

  if (existingIndex >= 0) {
    nextRows[existingIndex] = nextRow;
  } else {
    nextRows.push(nextRow);
  }

  return nextRows.sort((a, b) => a.date.localeCompare(b.date));
}

function syncFigure2InputsFromDailySnapshot(data, snapshot) {
  const dailyPerformance = calculateDailyPerformance(data);
  const accountRow = dailyPerformance.accountRows.find((row) => row.date === snapshot.date);
  if (!accountRow) {
    return;
  }

  data.assetSnapshots.ashare.currentTotalAssetsCny = numberOrZero(accountRow.aShare.endingAssetsCny);
  data.dailyBalances = upsertDailyBalance(data.dailyBalances, snapshot.date, numberOrZero(accountRow.aShare.dailyPnlCny));

  data.assetSnapshots.fund.currentAssetCny = numberOrZero(accountRow.fund.endingAssetsCny);

  const rate = numberOrZero(accountRow.usStock.jpyToCnyRate) || numberOrZero(data.assetSnapshots.usStock.jpyCnyRate);
  const earlyRealizedPnlJpy = numberOrZero(data.assetSnapshots.usStock.earlyRealizedPnlJpy);
  const laterRealizedPnlJpy = numberOrZero(data.assetSnapshots.usStock.laterRealizedPnlJpy);
  data.assetSnapshots.usStock.currentAssetJpy = numberOrZero(accountRow.usStock.endingAssetsJpy);
  data.assetSnapshots.usStock.jpyCnyRate = rate;
  data.assetSnapshots.usStock.floatingPnlJpy = rate
    ? numberOrZero(accountRow.usStock.cumulativePnlCny) / rate - earlyRealizedPnlJpy - laterRealizedPnlJpy
    : 0;
}

function DailySnapshotModal({ data, draft, index, mode, onChange, onClose, onSave }) {
  if (!draft) {
    return null;
  }

  const readOnly = mode === "view";
  const previewData = buildPreviewData(data, draft, index);
  const preview = calculateDailyPerformance(previewData);
  const previewRowIndex = index === null ? preview.accountRows.length - 1 : index;
  const previewRow = preview.accountRows[previewRowIndex];
  const aShareBasis = calculateAShareBasis(data);
  const aShareCurrentPnlCny = numberOrZero(draft.aShare.endingAssetsCny) - aShareBasis.remainingCostBasisCny;
  const usEndingCny = numberOrZero(draft.usStock.endingAssetsJpy) * numberOrZero(draft.usStock.jpyToCnyRate);
  const totalDailyPnl =
    numberOrZero(previewRow?.aShare?.dailyPnlCny)
    + numberOrZero(previewRow?.usStock?.dailyPnlCny)
    + numberOrZero(previewRow?.fund?.dailyPnlCny);

  function setField(assetKey, field, value) {
    if (!isDecimalInputText(value)) {
      return;
    }
    onChange((current) => ({
      ...current,
      [assetKey]: {
        ...current[assetKey],
        [field]: value
      }
    }));
  }

  function setDate(value) {
    onChange((current) => ({ ...current, date: value }));
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="新增每日账户记录">
      <div className="modal-panel">
        <div className="section-title">
          <h2>{index === null ? "新增每日账户记录" : readOnly ? "查看每日账户记录" : "编辑每日账户记录"}</h2>
          <button className="secondary" onClick={onClose}>关闭</button>
        </div>

        <div className="form-step">
          <h3>Step 1：日期</h3>
          <label>
            日期
            <input type="date" value={draft.date} disabled={readOnly} onChange={(event) => setDate(event.target.value)} />
          </label>
        </div>

        <div className="form-step">
          <h3>Step 2：A股账户</h3>
          <div className="metric-grid">
            <div><span>A股昨日总资产 CNY</span><strong>{money(previewRow?.aShare?.beginningAssetsCny)}</strong></div>
            <div><span>A股原始总本金 CNY</span><strong>{money(aShareBasis.originalTotalCapitalCny)}</strong></div>
            <div><span>A股已调仓到美股 CNY</span><strong>{money(aShareBasis.transferredToUsStockCny)}</strong></div>
            <div><span>A股调仓后留存成本 CNY</span><strong>{money(aShareBasis.remainingCostBasisCny)}</strong></div>
          </div>
          <div className="input-grid">
            <label>A股外部入金 CNY<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.aShare.externalDepositCny, { emptyZero: true })} onChange={(event) => setField("aShare", "externalDepositCny", event.target.value)} /></label>
            <label>A股外部出金 CNY<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.aShare.externalWithdrawalCny, { emptyZero: true })} onChange={(event) => setField("aShare", "externalWithdrawalCny", event.target.value)} /></label>
            <label>A股转入 CNY<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.aShare.transferInCny, { emptyZero: true })} onChange={(event) => setField("aShare", "transferInCny", event.target.value)} /></label>
            <label>A股转出 CNY<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.aShare.transferOutCny, { emptyZero: true })} onChange={(event) => setField("aShare", "transferOutCny", event.target.value)} /></label>
            <label>A股当前总资产 CNY（核对用）<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.aShare.endingAssetsCny, { emptyZero: true })} onChange={(event) => setField("aShare", "endingAssetsCny", event.target.value)} /></label>
          </div>
          <div className="metric-grid">
            <div><span>A股当日真实盈亏 CNY</span><strong className={valueClass(previewRow?.aShare?.dailyPnlCny)}>{money(previewRow?.aShare?.dailyPnlCny)}</strong></div>
            <div><span>A股累计盈亏 CNY</span><strong className={valueClass(previewRow?.aShare?.cumulativePnlCny)}>{money(previewRow?.aShare?.cumulativePnlCny)}</strong></div>
            <div><span>A股当前真实盈亏 CNY</span><strong className={valueClass(aShareCurrentPnlCny)}>{money(aShareCurrentPnlCny)}</strong></div>
            <div><span>A股当前收益率</span><strong className={valueClass(aShareCurrentPnlCny)}>{percent(aShareCurrentPnlCny / aShareBasis.remainingCostBasisCny)}</strong></div>
          </div>
        </div>

        <div className="form-step">
          <h3>Step 3：美股账户</h3>
          <div className="metric-grid">
            <div><span>美股昨日总资产 JPY</span><strong>{money(previewRow?.usStock?.beginningAssetsJpy, 0)}</strong></div>
          </div>
          <div className="input-grid">
            <label>美股外部入金 JPY<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.usStock.externalDepositJpy, { emptyZero: true })} onChange={(event) => setField("usStock", "externalDepositJpy", event.target.value)} /></label>
            <label>美股外部出金 JPY<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.usStock.externalWithdrawalJpy, { emptyZero: true })} onChange={(event) => setField("usStock", "externalWithdrawalJpy", event.target.value)} /></label>
            <label>美股转入 JPY<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.usStock.transferInJpy, { emptyZero: true })} onChange={(event) => setField("usStock", "transferInJpy", event.target.value)} /></label>
            <label>美股转出 JPY<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.usStock.transferOutJpy, { emptyZero: true })} onChange={(event) => setField("usStock", "transferOutJpy", event.target.value)} /></label>
            <label>美股当前总资产 JPY<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.usStock.endingAssetsJpy, { emptyZero: true })} onChange={(event) => setField("usStock", "endingAssetsJpy", event.target.value)} /></label>
            <label>JPY/CNY 汇率<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.usStock.jpyToCnyRate)} onChange={(event) => setField("usStock", "jpyToCnyRate", event.target.value)} /></label>
          </div>
          <div className="metric-grid">
            <div><span>美股当前总资产 CNY</span><strong>{money(usEndingCny)}</strong></div>
            <div><span>美股当日盈亏 CNY</span><strong className={valueClass(previewRow?.usStock?.dailyPnlCny)}>{money(previewRow?.usStock?.dailyPnlCny)}</strong></div>
            <div><span>美股累计盈亏 CNY</span><strong className={valueClass(previewRow?.usStock?.cumulativePnlCny)}>{money(previewRow?.usStock?.cumulativePnlCny)}</strong></div>
            <div><span>美股收益率</span><strong className={valueClass(previewRow?.usStock?.cumulativeReturnRate)}>{percent(previewRow?.usStock?.cumulativeReturnRate)}</strong></div>
          </div>
        </div>

        <div className="form-step">
          <h3>Step 4：基金账户</h3>
          <div className="metric-grid">
            <div><span>基金昨日总资产 CNY</span><strong>{money(previewRow?.fund?.beginningAssetsCny)}</strong></div>
          </div>
          <div className="input-grid">
            <label>基金外部入金 CNY<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.fund.externalDepositCny, { emptyZero: true })} onChange={(event) => setField("fund", "externalDepositCny", event.target.value)} /></label>
            <label>基金外部出金 CNY<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.fund.externalWithdrawalCny, { emptyZero: true })} onChange={(event) => setField("fund", "externalWithdrawalCny", event.target.value)} /></label>
            <label>基金转入 CNY<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.fund.transferInCny, { emptyZero: true })} onChange={(event) => setField("fund", "transferInCny", event.target.value)} /></label>
            <label>基金转出 CNY<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.fund.transferOutCny, { emptyZero: true })} onChange={(event) => setField("fund", "transferOutCny", event.target.value)} /></label>
            <label>基金当前总资产 CNY<input type="text" inputMode="decimal" disabled={readOnly} value={inputNumberValue(draft.fund.endingAssetsCny, { emptyZero: true })} onChange={(event) => setField("fund", "endingAssetsCny", event.target.value)} /></label>
          </div>
          <div className="metric-grid">
            <div><span>基金当日盈亏 CNY</span><strong className={valueClass(previewRow?.fund?.dailyPnlCny)}>{money(previewRow?.fund?.dailyPnlCny)}</strong></div>
            <div><span>基金累计盈亏 CNY</span><strong className={valueClass(previewRow?.fund?.cumulativePnlCny)}>{money(previewRow?.fund?.cumulativePnlCny)}</strong></div>
            <div><span>基金收益率</span><strong className={valueClass(previewRow?.fund?.cumulativeReturnRate)}>{percent(previewRow?.fund?.cumulativeReturnRate)}</strong></div>
          </div>
        </div>

        <div className="form-step">
          <h3>Step 5：确认保存</h3>
          <div className="metric-grid">
            <div><span>A股当前总资产</span><strong>{money(draft.aShare.endingAssetsCny)}</strong></div>
            <div><span>A股真实盈亏</span><strong className={valueClass(aShareCurrentPnlCny)}>{money(aShareCurrentPnlCny)}</strong></div>
            <div><span>美股当前总资产 JPY</span><strong>{money(draft.usStock.endingAssetsJpy, 0)}</strong></div>
            <div><span>美股当前总资产 CNY</span><strong>{money(usEndingCny)}</strong></div>
            <div><span>美股真实盈亏 CNY</span><strong className={valueClass(previewRow?.usStock?.dailyPnlCny)}>{money(previewRow?.usStock?.dailyPnlCny)}</strong></div>
            <div><span>基金当前总资产</span><strong>{money(draft.fund.endingAssetsCny)}</strong></div>
            <div><span>基金真实盈亏</span><strong className={valueClass(previewRow?.fund?.dailyPnlCny)}>{money(previewRow?.fund?.dailyPnlCny)}</strong></div>
            <div><span>当日总盈亏</span><strong className={valueClass(totalDailyPnl)}>{money(totalDailyPnl)}</strong></div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>取消</button>
          {!readOnly ? <button onClick={onSave}>{index === null ? "保存记录" : "保存修改"}</button> : null}
        </div>
      </div>
    </div>
  );
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? "请求失败");
    error.status = response.status;
    throw error;
  }
  return body;
}

function readJsonStorage(key) {
  const value = localStorage.getItem(key);
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function Login({ scope, onLogin }) {
  const [username, setUsername] = useState(scope === "admin" ? "admin" : "chen");
  const [password, setPassword] = useState(scope === "admin" ? "admin123" : "chen123");
  const [error, setError] = useState("");
  const title = scope === "admin" ? "管理员控制台" : "个人收益查询";

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const session = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password, scope })
      });
      onLogin(session.token);
    } catch (loginError) {
      setError(loginError.message);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={submit}>
        <h1>{title}</h1>
        <label>
          用户名
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          密码
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">登录</button>
      </form>
    </main>
  );
}

function SummaryTable({ rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>成员</th>
            <th>本金</th>
            <th>A股盈亏</th>
            <th>美股盈亏</th>
            <th>基金盈亏</th>
            <th>总盈亏</th>
            <th>收益率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.personId}>
              <td>{row.name}</td>
              <td>{money(row.capital)}</td>
              <td className={row.aShareProfit < 0 ? "negative" : "positive"}>{money(row.aShareProfit)}</td>
              <td className={row.usProfit < 0 ? "negative" : "positive"}>{money(row.usProfit)}</td>
              <td className={row.fundProfit < 0 ? "negative" : "positive"}>{money(row.fundProfit)}</td>
              <td className={row.totalProfit < 0 ? "negative strong" : "positive strong"}>{money(row.totalProfit)}</td>
              <td>{percent(row.returnRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserApp({ token, onLogout }) {
  const [person, setPerson] = useState(null);
  const [error, setError] = useState("");

  React.useEffect(() => {
    api("/api/user/summary", { token })
      .then((body) => setPerson(body.person))
      .catch((loadError) => {
        if (loadError.status === 401) {
          onLogout();
          return;
        }
        setError(loadError.message);
      });
  }, [token, onLogout]);

  return (
    <main className="app-shell">
      <header>
        <div>
          <span className="eyebrow">用户</span>
          <h1>我的投资收益</h1>
        </div>
        <button className="secondary" onClick={onLogout}>退出登录</button>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {person ? <SummaryTable rows={[person]} /> : <p>加载中...</p>}
    </main>
  );
}

function updateNested(data, path, value) {
  const next = structuredClone(data);
  let target = next;
  for (const key of path.slice(0, -1)) {
    target = target[key];
  }
  target[path.at(-1)] = value;
  return next;
}

function AdminApp({ token, onLogout }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [dailyModal, setDailyModal] = useState(null);

  React.useEffect(() => {
    for (const key of legacyAdminDraftStorageKeys) {
      localStorage.removeItem(key);
    }
    api("/api/admin/data", { token })
      .then((body) => {
        setData(readJsonStorage(adminDraftStorageKey) ?? body.data);
      })
      .catch((loadError) => {
        if (loadError.status === 401) {
          onLogout();
          return;
        }
        setError(loadError.message);
      });
  }, [token, onLogout]);

  React.useEffect(() => {
    if (data) {
      localStorage.setItem(adminDraftStorageKey, JSON.stringify(data));
    }
  }, [data]);

  const people = data?.people ?? [];
  const fund = data?.assetSnapshots?.fund ?? {};
  const sortedDailySnapshots = useMemo(() => sortDailySnapshotsByDate(data?.dailySnapshots ?? []), [data]);
  const dailyPerformance = useMemo(() => data ? calculateDailyPerformance(data) : null, [data]);
  const rows = useMemo(() => data ? calculateAll(data).summary : [], [data]);
  const fixedAllocationRows = useMemo(() => buildFixedAllocationRows(data, people), [data, people]);

  function setNumber(path, rawValue) {
    setData((current) => updateNested(current, path, rawValue === "" ? 0 : Number(rawValue)));
  }

  function setString(path, value) {
    setData((current) => updateNested(current, path, value));
  }

  function updateDaily(index, key, value) {
    setData((current) => {
      const next = structuredClone(current);
      next.dailyBalances[index][key] = key === "date" ? value : Number(value);
      return next;
    });
  }

  function openDailySnapshotModal(mode, index = null) {
    if (mode === "new") {
      const newSnapshot = appendDailySnapshot(data.dailySnapshots ?? [], initialDailyAccountAssets(data)).at(-1);
      const defaultAshareAssets = data.assetSnapshots?.ashare?.currentTotalAssetsCny;
      if (Number.isFinite(defaultAshareAssets)) {
        newSnapshot.aShare.endingAssetsCny = defaultAshareAssets;
      }
      newSnapshot.usStock.jpyToCnyRate = data.assetSnapshots?.usStock?.jpyCnyRate ?? newSnapshot.usStock.jpyToCnyRate;
      setDailyModal({
        mode: "edit",
        index: null,
        draft: normalizeDailySnapshotForForm(newSnapshot, data)
      });
      return;
    }

    const snapshot = data.dailySnapshots?.[index];
    if (!snapshot) {
      return;
    }
    setDailyModal({
      mode,
      index,
      draft: normalizeDailySnapshotForForm(snapshot, data)
    });
  }

  function saveDailySnapshotModal() {
    setData((current) => {
      const next = structuredClone(current);
      const snapshot = serializeDailySnapshotDraft(dailyModal.draft);
      next.dailySnapshots = next.dailySnapshots ?? [];
      if (dailyModal.index === null) {
        next.dailySnapshots = sortDailySnapshotsByDate([...next.dailySnapshots, snapshot]);
      } else {
        next.dailySnapshots[dailyModal.index] = snapshot;
        next.dailySnapshots = sortDailySnapshotsByDate(next.dailySnapshots);
      }
      syncFigure2InputsFromDailySnapshot(next, snapshot);
      return next;
    });
    setDailyModal(null);
  }

  function removeDailySnapshot(index) {
    setData((current) => {
      const next = structuredClone(current);
      next.dailySnapshots = (next.dailySnapshots ?? []).filter((_, rowIndex) => rowIndex !== index);
      return next;
    });
  }

  function updateFlow(index, key, value) {
    setData((current) => {
      const next = structuredClone(current);
      next.flows[index][key] = key === "amountCny" ? Number(value) : value;
      return next;
    });
  }

  function addFlow() {
    setData((current) => {
      const next = structuredClone(current);
      next.flows.push({
        id: `f-${Date.now()}`,
        date: next.dailyBalances.at(-1)?.date ?? "2026-06-24",
        asset: "ashare",
        personId: people[0]?.id ?? "wang",
        amountCny: 0,
        timing: "pre"
      });
      return next;
    });
  }

  function removeFlow(index) {
    setData((current) => {
      const next = structuredClone(current);
      next.flows = next.flows.filter((_, rowIndex) => rowIndex !== index);
      return next;
    });
  }

  function addDailyRow() {
    setData((current) => {
      const next = structuredClone(current);
      const lastDate = next.dailyBalances.at(-1)?.date ?? "2026-06-24";
      next.dailyBalances.push({
        id: `d-${Date.now()}`,
        date: lastDate,
        ashareProfitCny: 0
      });
      return next;
    });
  }

  function removeDailyRow(index) {
    setData((current) => {
      const next = structuredClone(current);
      next.dailyBalances = next.dailyBalances.filter((_, rowIndex) => rowIndex !== index);
      return next;
    });
  }

  async function save() {
    setStatus("");
    setError("");
    try {
      await api("/api/admin/data", {
        method: "PUT",
        token,
        body: JSON.stringify({ data })
      });
      localStorage.removeItem(adminDraftStorageKey);
      setStatus("已保存，并已创建备份。");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  if (!data) {
    return <main className="app-shell">{error ? <p className="error">{error}</p> : <p>加载中...</p>}</main>;
  }

  return (
    <main className="app-shell">
      <header>
        <div>
          <span className="eyebrow">管理员</span>
          <h1>投资数据录入</h1>
        </div>
        <div className="actions">
          <button className="secondary" onClick={() => {
            localStorage.removeItem(adminDraftStorageKey);
            onLogout();
          }}>退出登录</button>
          <button onClick={save}>保存</button>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {status ? <p className="status">{status}</p> : null}

      <section className="panel">
        <h2>当前汇总</h2>
        <SummaryTable rows={rows} />
      </section>

      <section className="panel">
        <div className="section-title">
          <h2>每日账户录入</h2>
          <button className="secondary" onClick={() => openDailySnapshotModal("new")}>新增日期</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>A股当前总资产 CNY</th>
                <th>A股资金流 CNY</th>
                <th>A股当日盈亏 CNY</th>
                <th>美股当前总资产 JPY</th>
                <th>美股当前总资产 CNY</th>
                <th>JPY/CNY 汇率</th>
                <th>美股当日盈亏 CNY</th>
                <th>基金当前总资产 CNY</th>
                <th>基金当日盈亏 CNY</th>
                <th>当日总盈亏 CNY</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedDailySnapshots.map((snapshot, index) => {
                const calculated = dailyPerformance?.accountRows[index];
                const totalDailyPnl =
                  numberOrZero(calculated?.aShare?.dailyPnlCny)
                  + numberOrZero(calculated?.usStock?.dailyPnlCny)
                  + numberOrZero(calculated?.fund?.dailyPnlCny);
                return (
                  <tr key={`${snapshot.date}-${index}`}>
                    <td>{snapshot.date}</td>
                    <td>{money(calculated?.aShare?.endingAssetsCny)}</td>
                    <td className={valueClass(calculated?.aShare?.netFlowCny)}>{money(calculated?.aShare?.netFlowCny)}</td>
                    <td className={valueClass(calculated?.aShare?.dailyPnlCny)}>{money(calculated?.aShare?.dailyPnlCny)}</td>
                    <td>{money(calculated?.usStock?.endingAssetsJpy, 0)}</td>
                    <td>{money(calculated?.usStock?.endingAssetsCny)}</td>
                    <td>{numberOrZero(calculated?.usStock?.jpyToCnyRate).toFixed(3)}</td>
                    <td className={valueClass(calculated?.usStock?.dailyPnlCny)}>{money(calculated?.usStock?.dailyPnlCny)}</td>
                    <td>{money(calculated?.fund?.endingAssetsCny)}</td>
                    <td className={valueClass(calculated?.fund?.dailyPnlCny)}>{money(calculated?.fund?.dailyPnlCny)}</td>
                    <td className={`${valueClass(totalDailyPnl)} strong`}>{money(totalDailyPnl)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="secondary" onClick={() => openDailySnapshotModal("view", index)}>查看</button>
                        <button className="secondary" onClick={() => openDailySnapshotModal("edit", index)}>编辑</button>
                        <button className="danger" onClick={() => removeDailySnapshot(index)}>删除</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <DailySnapshotModal
        data={data}
        draft={dailyModal?.draft}
        index={dailyModal?.index ?? null}
        mode={dailyModal?.mode}
        onChange={(updater) => setDailyModal((current) => ({ ...current, draft: updater(current.draft) }))}
        onClose={() => setDailyModal(null)}
        onSave={saveDailySnapshotModal}
      />

      <section className="panel">
        <h2>固定本金与分摊比例</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>成员/账户</th>
                <th>共同池初始本金 CNY</th>
                <th>共同池比例</th>
                <th>6.15前A股盈亏 CNY</th>
                <th>6.15调仓前共同池净值 CNY</th>
                <th>6.15实际转入美股金额 CNY</th>
                <th>调入美股分摊本金 CNY</th>
                <th>调仓后留在A股权益 CNY</th>
                <th>专项A股本金 CNY</th>
                <th>美股总分摊比例</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {fixedAllocationRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{money(row.commonInitialPrincipal)}</td>
                  <td>{percent(row.commonPoolRatio)}</td>
                  <td className={valueClass(row.preTransferAsharePnl)}>{money(row.preTransferAsharePnl)}</td>
                  <td>{money(row.preTransferCommonPoolValue)}</td>
                  <td>{money(row.commonPoolToUsStockCny)}</td>
                  <td>{money(row.transferredUsPrincipal)}</td>
                  <td>{money(row.retainedAshareEquity)}</td>
                  <td>{money(row.specialASharePrincipal)}</td>
                  <td>{percent(row.usRatio)}</td>
                  <td className="note-cell">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>基金</h2>
        <div className="input-grid">
          <label>归属人
            <select value={fund.ownerId} onChange={(event) => setString(["assetSnapshots", "fund", "ownerId"], event.target.value)}>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <label>本金 CNY<input type="number" value={fund.principalCny} onChange={(event) => setNumber(["assetSnapshots", "fund", "principalCny"], event.target.value)} /></label>
          <label>当前资产 CNY<input type="number" value={fund.currentAssetCny} onChange={(event) => setNumber(["assetSnapshots", "fund", "currentAssetCny"], event.target.value)} /></label>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <h2>A股每日盈亏</h2>
          <button className="secondary" onClick={addDailyRow}>新增行</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>日期</th><th>A股盈亏 CNY</th><th></th></tr>
            </thead>
            <tbody>
              {data.dailyBalances.map((row, index) => (
                <tr key={row.id}>
                  <td><input type="date" value={row.date} onChange={(event) => updateDaily(index, "date", event.target.value)} /></td>
                  <td><input type="number" value={row.ashareProfitCny} onChange={(event) => updateDaily(index, "ashareProfitCny", event.target.value)} /></td>
                  <td><button className="danger" onClick={() => removeDailyRow(index)}>删除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <h2>A股资金流水</h2>
          <button className="secondary" onClick={addFlow}>新增流水</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>日期</th><th>成员</th><th>金额 CNY</th><th>时点</th><th></th></tr>
            </thead>
            <tbody>
              {data.flows.map((flow, index) => (
                <tr key={flow.id}>
                  <td><input type="date" value={flow.date} onChange={(event) => updateFlow(index, "date", event.target.value)} /></td>
                  <td>
                    <select value={flow.personId} onChange={(event) => updateFlow(index, "personId", event.target.value)}>
                      <option value="common">公共池</option>
                      {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </select>
                  </td>
                  <td><input type="number" value={flow.amountCny} onChange={(event) => updateFlow(index, "amountCny", event.target.value)} /></td>
                  <td>
                    <select value={flow.timing} onChange={(event) => updateFlow(index, "timing", event.target.value)}>
                      <option value="pre">盘前</option>
                      <option value="post">盘后</option>
                    </select>
                  </td>
                  <td><button className="danger" onClick={() => removeFlow(index)}>删除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Root() {
  const [token, setToken] = useState(() => localStorage.getItem(sessionStorageKey) ?? "");
  const scope = useMemo(() => (isAdminRoute ? "admin" : "user"), []);
  function login(nextToken) {
    localStorage.setItem(sessionStorageKey, nextToken);
    setToken(nextToken);
  }
  function logout() {
    localStorage.removeItem(sessionStorageKey);
    setToken("");
  }
  if (!token) {
    return <Login scope={scope} onLogin={login} />;
  }
  return scope === "admin"
    ? <AdminApp token={token} onLogout={logout} />
    : <UserApp token={token} onLogout={logout} />;
}

createRoot(document.getElementById("root")).render(<Root />);
