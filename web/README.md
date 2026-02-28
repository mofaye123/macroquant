# MacroQuant Web UI (Next.js)

本目录是从 Streamlit UI 重构的前端版本，技术栈：
- React Functional Components + Next.js (App Router)
- Tailwind CSS（包含 arbitary values 精细样式）
- Lucide React 图标
- Inter 字体（Google Fonts）
- Unsplash 占位图

## 1. 静态 JSON 预计算（推荐）

推荐工作流是先用 Python 计算引擎生成静态 JSON，再由 Next.js 直接读取该文件：

```bash
cd /Users/momo/Desktop/MacroQuant_副本
pip install -r requirements.txt
python3 generate_static_macro_json.py
```

默认输出文件：
- `web/public/data/macro-data.json`

生成规则：
- 如果新结果是 degraded，且本地已有一份“更健康”的旧快照，脚本默认保留旧文件，不会覆盖。
- 如果你明确要覆盖 degraded 结果，可使用：

```bash
python3 generate_static_macro_json.py --allow-degraded
```

如果你本地已经跑着 Python API，并且想直接把当前实时结果导出成静态快照，也可以：

```bash
curl -s "http://127.0.0.1:8000/api/v1/macro-data?refresh=true" > web/public/data/macro-data.json
```

## 2. 启动 Python 计算 API（可选）

如果你仍希望本地调试实时 API，也可以启动：

```bash
cd /Users/momo/Desktop/MacroQuant_副本
uvicorn api_server:app --host 0.0.0.0 --port 8000 --reload
```

可选环境变量：
- `FRED_API_KEY`：覆盖默认 FRED key
- `MACRO_START_DATE`：默认 `2010-01-01`
- `MACRO_API_CACHE_TTL`：接口缓存秒数，默认 `300`

## 3. 本地开发（Next.js）

```bash
cd web
npm install
npm run dev
```

访问 `http://localhost:3000`。  
默认会优先请求：
- `/data/macro-data.json`（静态快照）

如果静态文件不存在，前端会回退到：
- `http://127.0.0.1:8000/api/v1/macro-data`

如果你需要改静态 JSON 路径：

```bash
NEXT_PUBLIC_MACRO_DATA_URL=/data/macro-data.json npm run dev
```

如果 Python API 不在本机 8000 端口，设置：

```bash
NEXT_PUBLIC_MACRO_API_BASE=http://your-api-host:8000 npm run dev
```

## 4. 构建静态站点

当前 `next.config.ts` 使用了 `output: "export"`，适合 Cloudflare Pages 静态部署：

```bash
cd web
npm run build:static
```

构建产物位于 `web/out`。

如果你已经有最新的静态快照，不希望构建阶段再触发 Python 计算，使用：

```bash
cd web
npm run build:cf
```

`build:cf` 会先校验 `public/data/macro-data.json` 是否存在且结构合法，然后直接构建静态站点。

## 5. Cloudflare Pages 部署（推荐）

### 方式 A：Cloudflare Dashboard
1. 新建 Pages 项目并连接仓库。
2. Root directory 设为 `web`。
3. Build command: `npm run build:cf`
4. Build output directory: `out`
5. Node 版本建议 `>=20`。

注意：
- `build:cf` 不会在 Cloudflare 构建机上调用 Python。
- 这意味着 `web/public/data/macro-data.json` 必须已经存在于构建上下文中。
- 如果你使用 Git 直连 Pages，请在本地生成好静态快照后把该 JSON 一并提交。
- 如果你使用 `wrangler pages deploy` 从本地上传构建产物，则不需要把 JSON 提交到 Git，只要本地已经生成即可。

### 方式 B：Wrangler CLI
```bash
cd web
npm install
npx wrangler login
npm run cf:deploy
```

> 首次使用 `cf:deploy` 前，请把 `package.json` 里的 `--project-name macroquant-ui` 改成你自己的 Pages 项目名。

如果你希望“先现场生成最新快照，再立刻部署”：

```bash
cd web
npm run cf:deploy:fresh
```

如果你希望从仓库根目录直接一键完成“生成快照 + Pages 部署”，使用：

```bash
cd /Users/momo/Desktop/MacroQuant_副本
chmod +x scripts/generate_and_deploy_pages.sh
./scripts/generate_and_deploy_pages.sh
```

这个脚本会：
- 调用 `npm run cf:deploy:fresh`
- 先生成最新 `web/public/data/macro-data.json`
- 再执行 `wrangler pages deploy`
- 自动附带 `--commit-dirty=true`，不再显示工作区未提交变更警告

## 6. 远端自动生成（不依赖本机）

如果你不希望依赖本机常驻运行，仓库现在也提供了 GitHub Actions 定时任务：

- 工作流文件：`.github/workflows/refresh-macro-snapshot.yml`
- 生成脚本：`scripts/refresh_static_snapshot_ci.sh`

行为：
- GitHub 每小时触发一次工作流（默认在每小时 `:05`）
- 每次都会重新抓取并生成候选快照
- 如果 `web/public/data/macro-data.json` 有变化，就自动提交回仓库
- 如果仓库配置了 Cloudflare 凭据，会继续自动部署到 Pages
- 如果新数据异常，生成脚本会保留上一版健康快照，并自动创建或更新一个 GitHub Issue 告警

这样做的结果是：
- 你的电脑不用开着
- 不需要手动运行本地命令
- 数据正常时，站点可每小时自动刷新到最新版本
- 数据异常时，不会用坏数据覆盖线上版本

首次启用前要确认：
1. 仓库已经推到 GitHub
2. GitHub Actions 已启用
3. 如果你需要覆盖默认 FRED key，在仓库 Secrets 里添加 `FRED_API_KEY`
4. 如果要让 GitHub Actions 直接发版到 Cloudflare，在仓库 Secrets 里添加：
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

你也可以在 GitHub Actions 页面手动点 `workflow_dispatch` 立即跑一次。

## 7. 说明

- Dashboard 与 A~G 模块页默认读取静态 JSON（仍复用 Python 现有 `_calculate_score_internal` 逻辑生成）。
- 静态文件不存在时，前端会尝试回退到 Python API；API 也不可用时，最后回退到 `lib/mock-data.ts`，避免白屏。
- 回测页当前仍是前端 mock 交互版（下一步可继续接 Python 回测引擎）。

## 8. 定时生成（美股开盘）

美股常规开盘时间是工作日 `09:30 America/New_York`。  
仓库内提供的定时脚本不会依赖你 Mac 当前的本地时区，而是每次运行时自己判断纽约时间。

核心脚本：
- `scripts/scheduled_generate_static.sh`

它会每分钟被调起一次，但只有在：
- 周一到周五
- 纽约时间 `09:30`

才真正执行 `generate_static_macro_json.py`。

### 方案 A：launchd（macOS 推荐）

安装：

```bash
cd /Users/momo/Desktop/MacroQuant_副本
chmod +x scripts/scheduled_generate_static.sh scripts/install_launchd_agent.sh
./scripts/install_launchd_agent.sh
```

这会：
- 把 launchd 配置安装到 `~/Library/LaunchAgents/com.macroquant.generate-static-json.plist`
- 自动创建一个 ASCII 安全软链接：`~/.macroquant/current -> 当前仓库`
- 自动创建实际执行脚本：`~/.macroquant/run_market_open_generate.sh`
- 每分钟检查一次
- 真正生成时间锁定在美股开盘 `09:30 ET`

日志位置：
- `~/.macroquant/logs/launchd-static-generate.out.log`
- `~/.macroquant/logs/launchd-static-generate.err.log`

手动立即测试一次：

```bash
./scripts/scheduled_generate_static.sh --force
```

### 方案 B：cron（可选）

安装：

```bash
cd /Users/momo/Desktop/MacroQuant_副本
chmod +x scripts/scheduled_generate_static.sh scripts/install_cron_job.sh
./scripts/install_cron_job.sh
```

仓库也提供了示例：
- `deploy/cron/macroquant.crontab.example`

cron 日志位置：
- `~/.macroquant/logs/cron-static-generate.log`

cron 安装脚本也会自动生成：
- `~/.macroquant/current`
- `~/.macroquant/run_market_open_generate.sh`
