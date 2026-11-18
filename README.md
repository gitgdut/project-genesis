# GENESIS — 90 秒，一起点亮浮岛

**观众扫码，共同救活一座链上浮岛。**

[产品入口](https://mia03ther.github.io/project-genesis/) · [无计时练习](https://mia03ther.github.io/project-genesis/play.html) · [产品与边界](docs/RELAUNCH.md)

每人只有 12 建造额度。第一块落下，90 秒倒计时开始。有人接通风塔，有人建起居民舱，至少三个地址共同安置生态园和信标。合约判定地块、额度、拆解权限、供电、超时和完成目标；手机和大屏读取同一份已确认状态。完成后可继续自由组装，超时后地图只读，主持人可再开一局。

这是短局协作游戏原型，不发行代币、不涉及真实资产。商业价值和现场观众体验尚待验证，测试通过不代表能保证获奖。

## 三种模式

- **本机练习**：不计时、无需钱包，A/B/C 是本机模拟角色，不是假装在线的玩家。记录可导出。
- **本地链现场演练**：电脑运行服务，同一可信局域网的手机共建。真实私有 Anvil 合约，网络 31337，最多九个不同临时账户，不需要手机钱包。
- **Monad Testnet 房间**：部署或加入同一个公开测试网合约。观看无需钱包，建造需要自己的测试钱包和测试 MON。公开钱包签名、实际手机和跨设备公网彩排尚未执行；本地 Anvil 成功不等于公开 Monad 验证。

## 先试玩

从源代码仓库根目录启动纯静态练习：

```powershell
py -3.12 -m http.server 8000 --bind 127.0.0.1 --directory frontend
```

另开 PowerShell：

```powershell
Start-Process 'http://127.0.0.1:8000/'
```

选模块 → 点相邻空地 → 确认组装。点自己的建筑可拆回额度，R 旋转、1–7 选模块。可进入岛内用 WASD/空格/拖动探索；手机有方向键。房间菜单提供昵称加入、创建/打开测试网房间。邀请面板提供二维码与现场大屏入口。

## Windows PowerShell：多人演练

需要 Python 3.12 和 Foundry 的 anvil/forge（使用 Solc 0.8.29）。从 checkout 运行：

```powershell
git clone --branch codex/genesis-relaunch https://github.com/mia03ther/project-genesis.git genesis-demo
Set-Location .\genesis-demo
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e '.[dev]'
$env:Path = "$env:USERPROFILE\.foundry\bin;$env:Path"
.\.venv\Scripts\python.exe -m genesis.live --host 0.0.0.0 --port 8030
```

浏览器打开 `http://127.0.0.1:8030/`，进入浮岛并填写昵称。第一位加入者为本地演练主持人，可在房间菜单新开挑战。手机需与电脑处于同一局域网。服务会尝试生成电脑的局域网邀请地址；如选错 VPN/网卡，可显式指定实际 IPv4：

```powershell
.\.venv\Scripts\python.exe -m genesis.live --host 0.0.0.0 --port 8030 --advertise-host 192.168.1.23
```

请替换示例 IP。也可从 `http://电脑局域网IP:8030/play.html?local=1` 打开后再分享。默认只绑定 `127.0.0.1` 时仅本机可访问，不能让手机扫描 localhost。没有自动修改 Windows 防火墙；路由器客户端隔离也可能阻止连接。

大屏打开同一服务的 `/play.html?wall=1`。本地服务只控制它启动的私有 Anvil 和临时账户，不可配置公共签名 RPC。Ctrl+C 会关闭自建节点；服务重启是新临时世界，请先导出记录。该标准库 HTTP 服务只供可信本机/局域网演练，不直接暴露到公网。

## 公开测试网

在注入钱包的浏览器切换到 Monad Testnet（10143），使用专门的测试钱包及测试 MON。点击“创建测试网房间”，确认部署后分享房间；其他人打开邀请、连接自己的钱包并确认建造交易。客户端校验网络和运行时代码，广播后等待收据，不提前显示成功。它不是免 gas 方案，尚未实测公开链确认时间或吞吐量。

合约源码：[GenesisCommunity.sol](contracts/GenesisCommunity.sol)。改变合约后，客户端与部署版本必须一致：

```powershell
forge build --root contracts --use 0.8.29
.\.venv\Scripts\python.exe tools/export_community.py
```

额度是不可转让计数，不是资产。每地址额度不等于每人额度，尚不解决公开社区的女巫和长期治理问题。

## 验证

开发检查使用 Node（本次 24.19.0）、Foundry 和 Python。网页无构建步骤，Python 运行时无第三方依赖。若环境未安装可选的 mypy：`python -m pip install mypy`。

```powershell
$env:Path = "$env:USERPROFILE\.foundry\bin;$env:Path"
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m mypy --strict genesis main.py
forge test --root contracts --use 0.8.29 -vv
node --test frontend/community/verify.mjs frontend/sandbox/verify.mjs frontend/studio/verify.mjs
$env:GENESIS_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path
node frontend/community/e2e.mjs
node frontend/verify_engine.mjs
node frontend/verify_epochs.mjs
node frontend/rehearse_demo.mjs
```

HTTP 端到端检查会启动并关闭私有 Anvil、三个独立会话和临时服务，实际提交交易验证权限、抢地、幂等、协作目标、供电与主持人重开，输出 [机器报告](docs/examples/relaunch-e2e.report.json)。这不等于浏览器或实际手机测试。

[实际验证记录](docs/validation/RELAUNCH_CHECKS.md) · [部署说明](DEPLOY.md) · [获奖项目研究](docs/BLITZ_WINNER_STUDY.md)

## 保留的基础设施

原 Python 文明引擎、CLI、SQLite 存档、Web3 学习 harness 和原有测试仍保留；画面不替代权威状态。

- [文明模拟与 CLI 文档](docs/LEGACY_SIMULATION.md)
- [Harness 架构](docs/HARNESS_ARCHITECTURE.md)、[经济规则](docs/ECONOMY.md)、[存档格式](docs/SAVE_FORMAT.md)
- 旧网页 `/legacy.html`；早期个人浮岛 `/sandbox.html`；观测站 `/world.html`

Three.js 和本地二维码编码器的 MIT 来源与许可证见 [vendor](frontend/vendor/README.md)。未复制红魔社区的代码、模型或贴图。未引入实时 AI、NFT、真实支付、Docker 或新数据库。
