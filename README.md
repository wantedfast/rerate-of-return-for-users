# Investment Returns MVP

Local React/Vite tool for recording investment account data and calculating each member's profit/loss and return rate.

## What This App Does

- Admin can record investment data in a local web UI.
- Users can log in and view their own return summary.
- The final member return view uses the confirmed `当前汇总`口径:
  - `总盈亏 = A股盈亏 + 美股盈亏 + 基金盈亏`
  - `收益率 = 总盈亏 / 本金`
- The old `当前分摊资产 - 初始投入本金 - 累计净入金` member-return formula is not used for the final summary.

## Tech Stack

- React
- Vite
- Express
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

If Vite chooses another port, use the URL printed in the terminal.

## Default Local Accounts

Admin:

```txt
username: admin
password: admin123
```

Users:

```txt
wang / wang123
chen / chen123
nanjing / nanjing123
garlicm / garlicm123
sugar / sugar123
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
