# Cosplay Voice Chat

根据 `doc/design.md` 的路线图实现的最小可行产品（MVP）。项目分为前端（React + Vite）和后端（Node.js HTTP 服务），展示以下核心功能：

- 角色选择：预置多位角色（哈利波特、苏格拉底等），每个角色包含问候语、背景与语气提示。
- 对话体验：用户可以通过文本或语音输入与所选角色对话，并查看完整聊天记录。
- 语音识别与合成：前端使用浏览器 `Web Speech API` 获取语音输入并播放角色语音回复。
- GPT 集成：后端可选接入 OpenAI Chat Completions 接口（提供 `OPENAI_API_KEY` 时启用），否则采用脚本化回复用于演示。

## 演示视频

<video width="800" controls>
  <source src="doc/demo.mp4" type="video/mp4">
  您的浏览器不支持视频播放，请<a href="doc/demo.mp4">点击这里下载视频</a>。
</video>

## 目录结构

```
Cosplay/
├── client/   # 前端 React (Vite) 应用
├── server/   # Node.js 后端 API (零依赖)
└── doc/      # 产品设计文档
```

## 快速开始

### 1. 克隆依赖并安装

```bash
# 后端
cd server
npm install   # 本后端无第三方依赖，此步骤确保生成 lockfile

# 前端
cd ../client
npm install
```

> **提示**：若当前环境无法访问 npm，请在具备网络的环境中安装依赖后再复制 `node_modules`。

### 2. 启动服务

```bash
# 启动后端 (默认端口 3001)
cd server
npm run dev

# 另开终端，启动前端 (默认端口 5173)
cd client
npm run dev
```

前端配置了 `/api` 代理，开发阶段可直接通过 `http://localhost:5173` 访问。

### 3. 配置 OpenAI（可选）

若需真实的 GPT 回复，将 OpenAI API key 写入后端环境变量：

```bash
export OPENAI_API_KEY="sk-xxxx"
# 可选：自定义模型或 Base URL
export OPENAI_MODEL="gpt-4o-mini"
export OPENAI_BASE_URL="https://api.openai.com/v1"
```

未配置 `OPENAI_API_KEY` 时，后端会提供角色化的预设回复，方便在离线环境演示。

## 功能说明

- `GET /api/characters`：返回角色列表及语音参数。
- `POST /api/chat`：接收角色 ID、用户消息和历史记录，尝试调用 OpenAI 生成回复，失败则回退至脚本化答案。
- 前端使用 `SpeechRecognition` 和 `speechSynthesis` 提供语音交互，同时提供文本输入备选。

## 后续迭代方向

- 在后端引入真正的 WebSocket / Socket.IO，实现更实时的语音流式体验。
- ~~增加角色管理界面以及持久化存储。~~
- 优化语音识别效果（多语言支持、噪声抑制等）。
- 增加单元测试与端到端测试，覆盖核心对话流程。

## 注意事项

- 浏览器必须支持 Web Speech API（Chrome 桌面版效果最佳）。
- 若使用 Safari，需要确保在安全上下文下（https）才能启用麦克风权限。
- 为保护隐私，请在真实部署中增加鉴权、速率限制以及日志脱敏处理。
