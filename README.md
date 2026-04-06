# 找个伴儿

找个伴儿是一个围绕活动发起、报名、群聊、履约、评分和信誉结果展示的仓库。当前仓库同时包含：

- 小程序前端：根目录下的 `pages/`、`components/`、`utils/`
- Go 后端：`backend/`
- 管理后台：`admin-web/`
- 推荐 worker：`backend/recommender/`

## 当前唯一真实的后端入口

- 源码入口：`backend/cmd/server/main.go`
- 健康检查：`GET /healthz`

任何 `bat`、`ps1` 或 `exe` 都只是启动包装，后端服务本身的真实入口只有这一处。

## 官方启动方式

### 1. 管理后台联调

适合调 `backend + admin-web`：

```powershell
.\start-admin-system.bat
```

说明：

- 会先重新构建当前后端源码，再启动 `admin-web`
- 默认后端地址为 `http://127.0.0.1:8080`
- 不负责拉起 recommender worker

### 2. 整栈联调

适合调 `backend + redis + recommender worker`：

```powershell
.\start-all.bat
.\status-all.bat
.\stop-all.bat
```

说明：

- `start-all.bat` 启动整栈
- `status-all.bat` 查看 8080、Redis、PID 和 `/healthz`
- `stop-all.bat` 停止整栈相关进程

## 常用目录

```text
pages/                  小程序页面
components/             小程序组件
utils/                  小程序数据层与展示层工具
backend/                Go 后端
admin-web/              管理后台
docs/                   正式项目说明文档
scripts/                启动、状态、停止脚本
```

## 文档索引

- 后端说明：`backend/README.md`
- 管理后台说明：`admin-web/README.md`
- 数据库说明：`docs/DATABASE-OVERVIEW.md`
- 仓库卫生与不上传内容：`docs/REPO-HYGIENE.md`

## 本地开发建议

- 主要调小程序和后台接口：优先使用 `start-admin-system.bat`
- 需要调推荐链路：优先使用 `start-all.bat`
- 只想单独调后端：进入 `backend/` 后运行 `go run ./cmd/server`
