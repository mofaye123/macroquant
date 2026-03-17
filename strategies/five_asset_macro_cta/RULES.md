# 权重与调仓规则

## Regime 映射

- `score < 35`: `RISK_OFF`
- `35 <= score < 65`: `NEUTRAL`
- `score >= 65`: `RISK_ON`

## 基础权重表

### `RISK_OFF`

- `BTC`: 8%
- `ETH`: 4%
- `XAU`: 48%
- `MSTR`: 3%
- `SPY`: 37%

### `NEUTRAL`

- `BTC`: 18%
- `ETH`: 12%
- `XAU`: 28%
- `MSTR`: 7%
- `SPY`: 35%

### `RISK_ON`

- `BTC`: 26%
- `ETH`: 20%
- `XAU`: 10%
- `MSTR`: 12%
- `SPY`: 32%

## 趋势过滤

### Crypto

- `STRONG`: 1.00
- `UP`: 0.92
- `FLAT`: 0.72
- `WEAK`: 0.40
- `BREAK`: 0.18

### Satellite

- `STRONG`: 1.00
- `UP`: 0.85
- `FLAT`: 0.55
- `WEAK`: 0.20
- `BREAK`: 0.00

### Equity

- `STRONG`: 1.00
- `UP`: 0.90
- `FLAT`: 0.70
- `WEAK`: 0.40
- `BREAK`: 0.15

### Defensive

- `STRONG`: 1.00
- `UP`: 0.95
- `FLAT`: 0.85
- `WEAK`: 0.65
- `BREAK`: 0.40

## 调仓规则

- 调仓频率：`每周`
- 最小持有天数：`5`
- 权重步长：`2%`
- 最小换手触发：`5%`

## 强制调仓

满足以下条件之一，可跳过常规调仓频率：

- regime 发生变化
- 风险信号急升

## MSTR 保护性空头

默认模式：`trend_relative_v1`（不再把溢价阈值作为唯一硬触发）。

- 触发：`MA20 < MA60 < MA120` 连续 `5` 天，并满足 `MSTR/BTC` 相对弱势或 `BTC 5D` 急跌
- 加仓：空头排列连续 `10` 天时升级为满仓保护层
- 平仓：`MSTR` 收盘站上 `MA20`（默认 `1` 天确认）即优先平仓；其余补充条件为 `MSTR > MA60` / `MSTR/BTC` 相对强弱修复 / 达到最大持仓天数
- 仓位：按 `nav_pct * leverage` 分层（默认 50% 起步，确认后到 100%）
- 上限：默认受 `BTC` 实际多头权重上限约束，避免保护仓位过冲

## 对冲资金分配（优先级）

- `BTC 2x / ETH 2x / MSTR 5x` 视为每条腿可用的**最大杠杆上限**，不是固定常开倍数。
- 组合设置总对冲预算上限（默认读取 `hedge_max_size_pct = 25% NAV`）。
- 分配顺序：先满足 `MSTR` 对冲需求，再把剩余预算按需求比例分配给 `BTC` 和 `ETH`。
