# Mutesolo v0.1.0

> **让多智能体协作像人类团队一样高效** — 通过 Discord + Web 控制台实现 AI Agent 分工协作、任务分配和进度可视化。

## 🎯 解决什么问题

多个 AI Agent（如不同模型、不同能力的子智能体）一起工作时，最大的痛点是**谁来指挥、怎么分工、如何追踪进度**。

Mutesolo 提供了一个控制台（Web Console），让你：

- **在 Web 端管理项目和需求**，像 Jira 一样组织任务
- **通过 Discord 派发任务**给不同能力的 Agent
- **实时看板追踪进度**，每个 Agent 在做什么一目了然
- **任务结果通过 Git 提交**，完整可追溯

### 典型场景

```
你（Project Lead）
  ├── 在 Web 端创建需求 "设计登录页"
  ├── 看板自动分配给 UI Agent（设计稿）
  ├── 完成后流转给 Frontend Agent（代码实现）
  ├── 再流转给 QA Agent（测试）
  └── 每个 Agent 完成自动 commit，你实时看到进度
```

## ✨ 核心功能

| 功能 | 说明 |
|------|------|
| 🗂️ **项目管理** | 项目、需求、看板、分支管理 |
| 📝 **需求编辑器** | BlockNote 富文本编辑器，支持图片、附件、腾讯文档 |
| 🤖 **Agent 注册** | Agent 能力注册与在线状态监控 |
| 📋 **任务分配** | 根据能力自动匹配或手动派发 |
| ⚡ **AI 提示词生成** | 根据需求自动生成 Agent 执行指令 |
| 📦 **技能市场** | 浏览、安装、查看来自 ClawHub 的 AI Skill |
| 💾 **本地优先** | SQLite + MinIO 本地存储，数据不离开你的设备 |

## 🚀 快速开始

```bash
# 启动 Web 控制台
go run ./cmd/mutesolo-web
# 访问 http://127.0.0.1:8787
```

需要对象存储（可选）：
```bash
docker compose up -d minio minio-init
```

## 🏗️ 架构

```
┌──────────────────────────────────────────────┐
│                  Discord                      │
│   (任务下发给 Agent / 人工确认 / 结果汇报)      │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│            Web Control Console                │
│  Projects → Board → TaskDetail → Prompt Gen  │
└──────────────────┬───────────────────────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
    ┌──────┐  ┌──────┐  ┌──────────┐
    │SQLite│  │MinIO │  │ClawHub   │
    │主状态│  │文件  │  │Skill市场 │
    └──────┘  └──────┘  └──────────┘
```

## 💡 核心设计

- **控制台不直接执行代码** — 只生成提示词，通过 Discord 下发给 Agent
- **人工在环**（Human-in-the-loop） — 任何时候你都可以介入、修改、取消
- **Git 完整追溯** — 每个 Agent 的产出物通过 Git commit 记录
- **本地存储** — SQLite 存主状态，MinIO 存文件，不上传云端

## 📁 项目结构

```
cmd/mutesolo-web/          # Web 控制台入口
internal/webapp/           # Go 后端 (API / 存储 / 提示词生成)
internal/storage/          # MinIO 客户端
webapps/control-console/   # React + Vite 前端
webapps/requirement-editor/ # BlockNote 需求编辑器
schema.sql                 # SQLite 数据库结构
scripts/                   # 迁移脚本与工具
```

## 🔧 技术栈

- **后端**: Go
- **前端**: React + TypeScript + Vite
- **存储**: SQLite (主状态) + MinIO (文件)
- **编辑器**: BlockNote (富文本)
- **协议**: A2A (Agent-to-Agent)

## 📚 相关链接

- [Agent 协调协议 (A2A)](https://github.com/KuMaMon2019s)
- [ClawHub 技能市场](https://clawhub.ai)

---

**Mutesolo** — 让你的 AI Agent 团队真正高效协作
