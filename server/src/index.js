// 导入 Node.js 核心模块
import http from 'node:http';
import os from 'node:os';
import dotenv from 'dotenv';

// 从 .env 文件加载环境变量
dotenv.config();

// 服务器配置 - 支持环境变量配置，有合理的默认值
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001; // 端口号，默认3001
const HOST = process.env.HOST || '0.0.0.0'; // 主机地址，0.0.0.0表示监听所有网络接口

// OpenAI API 配置 - 支持多种环境变量名称格式以保持兼容性
const OPENAI_BASE_URL = process.env.BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.MODEL || process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
const OPENAI_API_KEY = process.env.API_KEY || process.env.OPENAI_API_KEY;

/**
 * 角色配置数组 - 定义所有可用的AI角色及其特性
 * 每个角色包含：ID、姓名、问候语、性格、背景、说话技巧、语音参数等
 */
const characters = [
  {
    id: 'harry-potter', // 角色唯一标识符
    name: 'Harry Potter', // 显示名称
    greeting: "Hello there! I'm Harry Potter. Looking for a bit of magic today?", // 默认问候语
    personality: 'Brave, loyal, optimistic, slightly informal', // 性格特征
    background:
      'Wizard trained at Hogwarts. Known for courage, friendship, and a knack for getting into adventures.', // 背景故事
    speakingTips: 'Use references to magic, Hogwarts, and friendships.', // AI对话提示
    voice: {
      pitch: 1.05, // 语音音调
      rate: 1.05   // 语音语速
    }
  },
  {
    id: 'socrates',
    name: 'Socrates',
    greeting: 'Greetings. I am Socrates. Shall we examine the question together? ',
    personality: 'Philosophical, inquisitive, calm, thought-provoking',
    background:
      'Classical Greek philosopher renowned for the Socratic method and a relentless pursuit of truth.',
    speakingTips: 'Ask questions, encourage reflection, keep tone calm yet curious.',
    voice: {
      pitch: 0.95,
      rate: 0.9
    }
  },
  {
    id: 'princess-moon',
    name: 'Princess Moon',
    greeting: 'Hi there! Princess Moon reporting for sparkle duty. Ready for some fun? ',
    personality: 'Playful, bubbly, energetic, encouraging',
    background: 'A fictional magical heroine who loves adventure and cheering up friends.',
    speakingTips: 'Keep sentences upbeat, include whimsical imagery.',
    voice: {
      pitch: 1.2,
      rate: 1.1
    }
  }
];

/**
 * 设置跨域请求头
 * @param {http.ServerResponse} res - HTTP响应对象
 */
const allowCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
};

/**
 * 发送JSON响应
 * @param {http.ServerResponse} res - HTTP响应对象
 * @param {number} statusCode - HTTP状态码
 * @param {Object} payload - 要发送的数据
 */
const sendJson = (res, statusCode, payload) => {
  const data = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  });
  res.end(data);
};

/**
 * 读取请求体数据
 * @param {http.IncomingMessage} req - HTTP请求对象
 * @returns {Promise<Object>} 解析后的JSON对象
 */
const readRequestBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

/**
 * 映射和清理对话历史消息
 * @param {Array} rawHistory - 原始历史消息数组
 * @returns {Array} 清理后的消息数组，最多保留10条
 */
const mapHistoryMessages = (rawHistory = []) => {
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const { role, content } = entry;
      if (!role || !content) return null;
      const normalizedRole = role === 'assistant' ? 'assistant' : 'user';
      return { role: normalizedRole, content: String(content) };
    })
    .filter(Boolean)
    .slice(-10); // 保留最近10条消息以控制成本
};

/**
 * 生成角色回复的备用方案（当OpenAI API不可用时）
 * @param {Object} character - 角色对象
 * @param {string} userMessage - 用户消息
 * @returns {string} 角色回复
 */
const fallbackCharacterReply = (character, userMessage) => {
  if (!character) {
    return "I'm not sure which character I am right now, but I'm happy to chat!";
  }

  if (!userMessage) {
    return character.greeting;
  }

  const base = `${character.name} here: `;
  if (userMessage.toLowerCase().includes('hello') || userMessage.toLowerCase().includes('hi')) {
    return `${base}${character.greeting}`;
  }
  if (character.id === 'harry-potter') {
    return `${base}That sounds like a challenge worthy of a spell or two. Have you tried Lumos on the problem?`;
  }
  if (character.id === 'socrates') {
    return `${base}Let us examine that more closely. Why do you think it appears that way?`;
  }
  return `${base}That sounds exciting! Tell me more so we can make it even better.`;
};

/**
 * 构建OpenAI系统提示词
 * @param {Object} character - 角色对象
 * @returns {string} 系统提示词
 */
const buildSystemPrompt = (character) => {
  if (!character) {
    return 'You are a friendly AI companion. Respond in two concise sentences.';
  }
  return `You are roleplaying as ${character.name}. Personality: ${character.personality}. Background: ${character.background}. Speaking tips: ${character.speakingTips}. Keep replies to 2-3 concise sentences, staying in character.`;
};

/**
 * 调用OpenAI API生成角色回复
 * @param {Object} params - 参数对象
 * @param {Object} params.character - 角色对象
 * @param {Array} params.history - 对话历史
 * @param {string} params.message - 用户消息
 * @returns {Promise<string|null>} AI生成的回复或null（失败时）
 */
const callOpenAI = async ({ character, history, message }) => {
  if (!OPENAI_API_KEY) return null;

  // 构建消息数组：系统提示 + 历史对话 + 当前用户消息
  const messages = [
    { role: 'system', content: buildSystemPrompt(character) },
    ...history,
    { role: 'user', content: message }
  ];

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.8, // 控制回复的创造性，0.8为中等创造性
      messages,
      max_tokens: 180 // 限制回复长度
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const choice = data?.choices?.[0]?.message?.content;
  return choice ? choice.trim() : null;
};

/**
 * HTTP服务器实例 - 处理所有API请求
 */
const server = http.createServer(async (req, res) => {
  try {
    // 为所有响应设置CORS头
    allowCors(res);

    // 处理预检请求（OPTIONS方法）
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const { method, url } = req;
    const parsedUrl = new URL(url, `http://${req.headers.host}`);

    // API路由：健康检查端点
    if (method === 'GET' && parsedUrl.pathname === '/api/health') {
      sendJson(res, 200, {
        status: 'ok',
        uptime: process.uptime(), // 服务器运行时间
        hostname: os.hostname()   // 主机名
      });
      return;
    }

    // API路由：获取所有角色列表
    if (method === 'GET' && parsedUrl.pathname === '/api/characters') {
      sendJson(res, 200, { characters });
      return;
    }

    // API路由：聊天接口 - 主要业务逻辑
    if (method === 'POST' && parsedUrl.pathname === '/api/chat') {
      let payload;
      try {
        payload = await readRequestBody(req);
      } catch (err) {
        sendJson(res, 400, { error: 'Invalid JSON payload.' });
        return;
      }

      const { characterId, message, history: rawHistory } = payload || {};
      // 根据角色ID查找角色，如果找不到则使用第一个角色作为默认值
      const character = characters.find((item) => item.id === characterId) || characters[0];
      const trimmedMessage = (message || '').toString().trim();

      // 验证必需参数
      if (!trimmedMessage) {
        sendJson(res, 400, { error: 'Message is required.' });
        return;
      }

      // 处理对话历史
      const history = mapHistoryMessages(rawHistory);

      let reply;
      try {
        // 尝试使用OpenAI API生成回复
        reply = await callOpenAI({ character, history, message: trimmedMessage });
      } catch (error) {
        console.warn('[chat] OpenAI fallback triggered:', error.message);
      }

      // 如果OpenAI API失败，使用备用回复逻辑
      if (!reply) {
        reply = fallbackCharacterReply(character, trimmedMessage);
      }

      // 构建响应数据
      const responsePayload = {
        characterId: character.id,
        reply,
        voice: character.voice // 包含语音参数供前端使用
      };

      sendJson(res, 200, responsePayload);
      return;
    }

    // 404处理：未找到的路由
    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    // 全局错误处理
    console.error('Server error', error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    } else {
      res.end();
    }
  }
});

/**
 * 启动HTTP服务器
 * 监听指定的主机和端口，输出启动信息和状态
 */
server.listen(PORT, HOST, () => {
  console.log(`Cosplay MVP backend listening on http://${HOST}:${PORT}`);
  if (!OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY not set. Using scripted fallback responses.');
  }
});
