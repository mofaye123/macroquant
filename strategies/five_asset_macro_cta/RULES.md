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

只在 `RISK_OFF` 环境启用。

- `BREAK`: 6%
- `WEAK` 且风险信号足够高：3%
- 借券/持有成本：`2 bps/日`
