# 实施路线

## Phase 1

冻结策略定义：

- regime 映射
- 资产角色
- 基础权重表
- 趋势过滤规则
- 组合级风控边界

## Phase 2

实现新的组合回测引擎：

- 独立读取宏观总分
- 独立读取 5 资产价格
- 输出组合 NAV / MDD / Sharpe / monthly / attribution

## Phase 3

接入新的前端看板数据流：

- 组合权重
- 组合表现
- regime
- 风险信号
- 实时价格

## Phase 4

接入 Bitget 执行层：

- 行情
- 账户
- 持仓
- 下单
- 纸交易

## Phase 5

上线前准备：

- 日志
- 告警
- 风控阈值
- 故障切换
- 实盘 SOP
