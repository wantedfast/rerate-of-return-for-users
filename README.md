# Investment Returns MVP

本地 React/Vite 工具，用于维护投资账户数据，并展示每个成员的本金、盈亏和收益率。

## 当前功能

- 管理员页面：录入每日 A股 / 美股 / 基金账户数据。
- 用户页面：展示 Liquid Glass 风格的 `投资收益总览`。
- 用户端包含：
  - 本金折算（JPY）
  - 累计盈亏（JPY）
  - 累计收益率
  - 历史收益率曲线
  - 7D / 30D / 90D / 1Y / ALL 范围切换
  - 自定义开始日期 / 结束日期
  - 收益率 / 累计盈亏模式切换
- 最终成员收益口径使用 `当前汇总`：
  - `总盈亏 = A股盈亏 + 美股盈亏 + 基金盈亏`
  - `收益率 = 总盈亏 / 本金`
- 不再使用错误的 `当前分摊资产 - 初始投入本金 - 累计净入金` 公式反推成员收益。

## Tech Stack

- React
- Vite
- Express
- Recharts
- Node test runner
- Local JSON persistence

## Install

```bash
pnpm install
```

## Run Locally

```bash
pnpm dev
```

Default URLs:

- Admin: `http://127.0.0.1:5173/admin`
- User: `http://127.0.0.1:5173/`

If Vite chooses another port, use the URL printed in the terminal. In the current local session the app is available at `http://127.0.0.1:5190/`.

## Default Local Accounts

Admin:

```txt
username: admin
password: admin123
```

Users:

```txt
wang / 589602
chen / 589602
nanjing / 589602
garlicm / 589602
sugar / 589602
```

These are local MVP credentials stored in `data/investment-data.json`.

## Commands

```bash
pnpm test
pnpm build
pnpm dev
```

## Data Files

Main editable data:

```txt
data/investment-data.json
```

Recorded source Excel workbook:

```txt
data/source/个人盈亏维护表_阶段美股版.xlsx
```

Rollback snapshot:

```txt
data/snapshots/investment-data-2026-06-27-task007.json
```

The source workbook is kept in the repo so the calculation seed can be audited against the original Excel data.

## Rollback Data

To restore the tracked JSON snapshot:

```powershell
Copy-Item -LiteralPath data\snapshots\investment-data-2026-06-27-task007.json -Destination data\investment-data.json -Force
```

Then restart the dev server.

## Current Accepted Summary

The accepted current summary should match:

```txt
王欣隆    20,836.37   -517.63     -792.75       -34.54      -1,344.92    -6.45%
Chen      5,000.00    -668.34     -280.40       0.00       -948.74      -18.97%
南京哥    7,000.00    -935.68     -392.55       0.00       -1,328.23    -18.97%
Garlicm   20,036.76   1,087.72    -933.59       0.00       154.12       0.77%
糖        20,056.00   -69.07      -3,006.52     0.00       -3,075.60    -15.34%
```

## Notes

- Keep intermediate calculations high precision.
- Round only for display.
- Run `pnpm test` after changing formulas or data allocation rules.
- Do not push remote changes until explicitly requested.
