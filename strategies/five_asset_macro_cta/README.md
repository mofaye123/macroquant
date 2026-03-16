# Five-Asset Macro CTA

这个目录专门承载新的 `5` 资产组合策略，和现有仓库中的原始单资产宏观回测逻辑完全分开。

## 目录原则

- 不修改原有策略文件
- 新策略的文档、配置、回测引擎、执行层都放在这里
- 后续如果接入 Bitget、组合回测、纸交易，也优先放在这个目录下

## 当前文件

- `STRATEGY_BASELINE.md`: 这版 5 资产组合策略的基线说明
- `ROADMAP.md`: 从策略定义到回测、仿真、实盘的推进顺序
- `RULES.md`: 已冻结的权重表与调仓规则
- `src/config.py`: 新策略专用的基础配置骨架
- `src/engine.py`: 新策略独立组合回测引擎
- `run_backtest.py`: 生成这版策略回测 JSON 的独立入口

## 与原策略的边界

原策略仍然在现有项目主线中运行，尤其是：

- `modules/backtest.py`
- `api_server.py`
- `web` 里的现有回测页面和数据流

这个目录是新策略的独立工作区，后续实现时不应直接覆盖旧逻辑。

## 运行方式

在仓库根目录执行：

```bash
python3 strategies/five_asset_macro_cta/run_backtest.py --start-date 2020-01-01
```

默认输出：

- `strategies/five_asset_macro_cta/outputs/latest_backtest.json`
