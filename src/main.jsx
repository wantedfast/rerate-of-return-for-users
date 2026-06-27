import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ASSET_LABEL,
  ASSET_TYPES,
  FLOW_TIMING_LABEL,
  FLOW_TIMINGS,
  FLOW_TYPE_LABEL,
  FLOW_TYPES,
  HOLDER_OPTIONS
} from "./shared/model.js";
import { roundCurrency } from "./calculations.js";
import "./styles.css";

const TOKEN_KEY = "investment_returns_token";
const USER_KEY = "investment_returns_user";

function formatCurrency(value) {
  return roundCurrency(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatRate(value) {
  return value === null || value === undefined ? "--" : `${(value * 100).toFixed(2)}%`;
}

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(body?.error ?? "请求失败");
  }
  return body;
}

function App() {
  const isAdminRoute = window.location.pathname.startsWith("/admin");
  const [session, setSession] = useState(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const expectedRole = isAdminRoute ? "admin" : "user";

  function setAuthenticated(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setSession(user);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setSession(null);
  }

  if (!session || session.role !== expectedRole) {
    return <LoginPage scope={expectedRole} onLogin={setAuthenticated} />;
  }

  return expectedRole === "admin"
    ? <AdminPage user={session} onLogout={logout} />
    : <UserPage user={session} onLogout={logout} />;
}

function LoginPage({ scope, onLogin }) {
  const [username, setUsername] = useState(scope === "admin" ? "admin" : "wang");
  const [password, setPassword] = useState(scope === "admin" ? "admin123" : "wang123");
  const [error, setError] = useState("");
  const title = scope === "admin" ? "管理员登录" : "个人收益登录";

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const result = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password, scope })
      });
      onLogin(result.token, result.user);
    } catch (caught) {
      setError(caught.message);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <h1>{title}</h1>
        <label>
          用户名
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          密码
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">登录</button>
        <a href={scope === "admin" ? "/" : "/admin"}>
          {scope === "admin" ? "进入个人查看页" : "进入管理员页"}
        </a>
      </form>
    </main>
  );
}

function UserPage({ user, onLogout }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/user/summary")
      .then((payload) => setSummary(payload.person))
      .catch((caught) => setError(caught.message));
  }, []);

  return (
    <main className="app-shell">
      <Header title="个人投资收益率" subtitle={`当前登录：${user.displayName}`} onLogout={onLogout} />
      {error && <p className="error">{error}</p>}
      {summary && (
        <section className="summary-grid user-grid">
          <Metric label="总盈亏 CNY" value={formatCurrency(summary.totalProfit)} tone={summary.totalProfit} />
          <Metric label="现金余额 CNY" value={formatCurrency(summary.cashBalance)} />
          <Metric label="手续费 CNY" value={formatCurrency(summary.fee)} tone={-summary.fee} />
          <Metric label="投入本金 CNY" value={formatCurrency(summary.capital)} />
          <Metric label="收益率" value={formatRate(summary.returnRate)} tone={summary.returnRate} />
        </section>
      )}
    </main>
  );
}

function AdminPage({ user, onLogout }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setError("");
    try {
      setPayload(await api("/api/admin/dashboard"));
    } catch (caught) {
      setError(caught.message);
    }
  }

  function setData(updater) {
    setPayload((current) => ({ ...current, data: updater(current.data) }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const next = await api("/api/admin/data", {
        method: "PUT",
        body: JSON.stringify({ data: payload.data })
      });
      setPayload(next);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  }

  async function download(path, filename) {
    const token = localStorage.getItem(TOKEN_KEY);
    const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      setError("导出失败");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  const totals = payload?.results?.totals;

  return (
    <main className="app-shell">
      <Header title="管理员工作台" subtitle={`当前登录：${user.displayName}`} onLogout={onLogout}>
        <button onClick={() => download("/api/admin/export/data", "investment-data.json")}>导出 JSON</button>
        <button onClick={() => download("/api/admin/export/results.csv", "investment-results.csv")}>导出 CSV</button>
        <button className="primary" onClick={save} disabled={!payload || saving}>{saving ? "保存中" : "保存并重算"}</button>
      </Header>

      {error && <p className="error">{error}</p>}
      {!payload && !error && <p>加载中...</p>}
      {payload && (
        <>
          <section className="summary-grid">
            <Metric label="总盈亏 CNY" value={formatCurrency(totals.totalProfit)} tone={totals.totalProfit} />
            <Metric label="A股盈亏" value={formatCurrency(totals.aShareProfit)} tone={totals.aShareProfit} />
            <Metric label="美股盈亏" value={formatCurrency(totals.usProfit)} tone={totals.usProfit} />
            <Metric label="基金盈亏" value={formatCurrency(totals.fundProfit)} tone={totals.fundProfit} />
            <Metric label="现金余额" value={formatCurrency(totals.cashBalance)} />
            <Metric label="手续费" value={formatCurrency(totals.fee)} tone={-totals.fee} />
          </section>

          <AssetEditor data={payload.data} setData={setData} />
          <CashFeeEditor data={payload.data} setData={setData} people={payload.meta.people} />
          <SummaryTable rows={payload.results.summary} />
          <SplitDetails results={payload.results} />
          <FlowEditor data={payload.data} setData={setData} />
          <FlowDetails flows={payload.results.flowDetails} />
          <AshareTimeline data={payload.data} setData={setData} />
        </>
      )}
    </main>
  );
}

function Header({ title, subtitle, onLogout, children }) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="actions">
        {children}
        <button className="secondary" onClick={onLogout}>退出</button>
      </div>
    </header>
  );
}

function Metric({ label, value, tone }) {
  const className = tone === undefined ? "" : tone >= 0 ? "pos" : "neg";
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={className}>{value}</strong>
    </div>
  );
}

function AssetEditor({ data, setData }) {
  function update(path, value) {
    setData((current) => {
      const next = structuredClone(current);
      const [section, key] = path;
      next.assetSnapshots[section][key] = Number(value);
      return next;
    });
  }

  return (
    <section className="panel">
      <h2>每日账户金额</h2>
      <div className="input-grid">
        <label>美股本金 JPY
          <input type="number" value={data.assetSnapshots.usStock.principalJpy} onChange={(event) => update(["usStock", "principalJpy"], event.target.value)} />
        </label>
        <label>美股当前资产 JPY
          <input type="number" value={data.assetSnapshots.usStock.currentAssetJpy} onChange={(event) => update(["usStock", "currentAssetJpy"], event.target.value)} />
        </label>
        <label>JPY/CNY 汇率
          <input type="number" step="0.0001" value={data.assetSnapshots.usStock.jpyCnyRate} onChange={(event) => update(["usStock", "jpyCnyRate"], event.target.value)} />
        </label>
        <label>基金本金 CNY
          <input type="number" value={data.assetSnapshots.fund.principalCny} onChange={(event) => update(["fund", "principalCny"], event.target.value)} />
        </label>
        <label>基金当前资产 CNY
          <input type="number" value={data.assetSnapshots.fund.currentAssetCny} onChange={(event) => update(["fund", "currentAssetCny"], event.target.value)} />
        </label>
      </div>
    </section>
  );
}

function CashFeeEditor({ data, setData, people }) {
  function update(bucket, personId, value) {
    setData((current) => {
      const next = structuredClone(current);
      next[bucket] = next[bucket] ?? {};
      next[bucket][personId] = Number(value);
      return next;
    });
  }

  return (
    <section className="panel">
      <h2>现金余额 / 手续费</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>人</th>
              <th>现金余额 CNY</th>
              <th>手续费 CNY</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id}>
                <td>{person.name}</td>
                <td><input type="number" value={data.cashBalances?.[person.id] ?? 0} onChange={(event) => update("cashBalances", person.id, event.target.value)} /></td>
                <td><input type="number" value={data.fees?.[person.id] ?? 0} onChange={(event) => update("fees", person.id, event.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryTable({ rows }) {
  return (
    <section className="panel">
      <h2>收益汇总</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>人</th>
              <th>A股</th>
              <th>基金</th>
              <th>美股</th>
              <th>现金余额</th>
              <th>手续费</th>
              <th>总盈亏</th>
              <th>投入本金</th>
              <th>收益率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.personId}>
                <td>{row.personName}</td>
                <MoneyCell value={row.aShareProfit} />
                <MoneyCell value={row.fundProfit} />
                <MoneyCell value={row.usProfit} />
                <td>{formatCurrency(row.cashBalance)}</td>
                <MoneyCell value={-row.fee} />
                <MoneyCell value={row.totalProfit} strong />
                <td>{formatCurrency(row.capital)}</td>
                <td className={row.returnRate >= 0 ? "pos strong" : "neg strong"}>{formatRate(row.returnRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MoneyCell({ value, strong = false }) {
  return <td className={`${value >= 0 ? "pos" : "neg"} ${strong ? "strong" : ""}`}>{formatCurrency(value)}</td>;
}

function FlowEditor({ data, setData }) {
  function updateFlow(index, key, value) {
    setData((current) => {
      const next = structuredClone(current);
      next.flows[index][key] = key === "amount" ? Number(value) : value;
      const holderOption = HOLDER_OPTIONS.find((option) => option.value === next.flows[index].holderId);
      if (key === "holderId" && holderOption) {
        next.flows[index].holderType = holderOption.holderType;
      }
      return next;
    });
  }

  function addFlow() {
    setData((current) => ({
      ...current,
      flows: [
        ...current.flows,
        {
          id: `flow-${Date.now()}`,
          date: current.assetSnapshots.aShareDaily.at(-1)?.date ?? "",
          assetType: "ashare",
          type: "deposit",
          amount: 0,
          timing: "pre",
          holderType: "person",
          holderId: "wang"
        }
      ]
    }));
  }

  function removeFlow(index) {
    setData((current) => ({
      ...current,
      flows: current.flows.filter((_, rowIndex) => rowIndex !== index)
    }));
  }

  return (
    <section className="panel">
      <div className="section-header">
        <h2>资金变动：入金 / 出金</h2>
        <button onClick={addFlow}>新增流水</button>
      </div>
      <div className="table-wrap">
        <table className="editable-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>资产</th>
              <th>类型</th>
              <th>金额</th>
              <th>归属</th>
              <th>时点</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.flows.map((flow, index) => (
              <tr key={flow.id}>
                <td><input type="date" value={flow.date} onChange={(event) => updateFlow(index, "date", event.target.value)} /></td>
                <td><Select value={flow.assetType} options={ASSET_TYPES.map((value) => [value, ASSET_LABEL[value]])} onChange={(value) => updateFlow(index, "assetType", value)} /></td>
                <td><Select value={flow.type} options={FLOW_TYPES.map((value) => [value, FLOW_TYPE_LABEL[value]])} onChange={(value) => updateFlow(index, "type", value)} /></td>
                <td><input type="number" value={flow.amount} onChange={(event) => updateFlow(index, "amount", event.target.value)} /></td>
                <td><Select value={flow.holderId} options={HOLDER_OPTIONS.map((option) => [option.value, option.label])} onChange={(value) => updateFlow(index, "holderId", value)} /></td>
                <td><Select value={flow.timing} options={FLOW_TIMINGS.map((value) => [value, FLOW_TIMING_LABEL[value]])} onChange={(value) => updateFlow(index, "timing", value)} /></td>
                <td><button className="danger" onClick={() => removeFlow(index)}>删除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AshareTimeline({ data, setData }) {
  function updateDaily(index, key, value) {
    setData((current) => {
      const next = structuredClone(current);
      next.assetSnapshots.aShareDaily[index][key] = key === "totalCny" ? Number(value) : value;
      return next;
    });
  }

  function addDailyRow() {
    setData((current) => {
      const next = structuredClone(current);
      next.assetSnapshots.aShareDaily.push({ id: `d-${Date.now()}`, date: "", totalCny: 0 });
      return next;
    });
  }

  return (
    <section className="panel">
      <div className="section-header">
        <h2>A股每日总资产</h2>
        <button onClick={addDailyRow}>新增日期</button>
      </div>
      <div className="timeline">
        {data.assetSnapshots.aShareDaily.map((row, index) => (
          <div className="timeline-row" key={row.id}>
            <input type="date" value={row.date} onChange={(event) => updateDaily(index, "date", event.target.value)} />
            <input type="number" value={row.totalCny ?? 0} onChange={(event) => updateDaily(index, "totalCny", event.target.value)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function SplitDetails({ results }) {
  const rows = results.summary;
  return (
    <section className="panel">
      <h2>资产分拆</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>人</th>
              <th>A股本金</th>
              <th>A股盈亏</th>
              <th>基金本金</th>
              <th>基金盈亏</th>
              <th>美股本金 CNY</th>
              <th>美股盈亏 CNY</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.personId}>
                <td>{row.personName}</td>
                <td>{formatCurrency(results.splits.ashare.capitalByPerson[row.personId])}</td>
                <MoneyCell value={results.splits.ashare.byPerson[row.personId]} />
                <td>{formatCurrency(results.splits.fund.capitalByPerson[row.personId])}</td>
                <MoneyCell value={results.splits.fund.byPerson[row.personId]} />
                <td>{formatCurrency(results.splits.us.capitalByPerson[row.personId])}</td>
                <MoneyCell value={results.splits.us.byPerson[row.personId]} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FlowDetails({ flows }) {
  return (
    <section className="panel">
      <h2>流水个人分摊明细</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>资产</th>
              <th>类型</th>
              <th>归属</th>
              <th>时点</th>
              <th>个人分摊</th>
            </tr>
          </thead>
          <tbody>
            {flows.map((flow) => (
              <tr key={flow.id}>
                <td>{flow.date}</td>
                <td>{ASSET_LABEL[flow.assetType]}</td>
                <td>{FLOW_TYPE_LABEL[flow.type]}</td>
                <td>{flow.holder}</td>
                <td>{FLOW_TIMING_LABEL[flow.timing]}</td>
                <td className="wrap-cell">
                  {flow.personBreakdown.map((row) => `${row.personName}: ${formatCurrency(row.amount)}`).join("；")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Select({ value, options, onChange }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>{label}</option>
      ))}
    </select>
  );
}

createRoot(document.getElementById("root")).render(<App />);
