# Data Records

## Main Data

`investment-data.json` is the active local app data file.

## Source Excel

`source/个人盈亏维护表_阶段美股版.xlsx` is the recorded Excel source used to seed and audit the current calculation data.

SHA256:

```txt
905931C67247EF5DECA961DD6CE74F293CE595B17F13BDA1233907C05AB82ECE
```

## Rollback Snapshot

`snapshots/investment-data-2026-06-27-task007.json` is a rollback copy of the current accepted JSON data after the decimal-input fix.

SHA256:

```txt
ABDAE9DED3D1EE480373996EB68583CEDD3041B57642B1567B32633706E9680C
```

Restore command:

```powershell
Copy-Item -LiteralPath data\snapshots\investment-data-2026-06-27-task007.json -Destination data\investment-data.json -Force
```
