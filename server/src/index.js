import http from 'node:http';
import os from 'node:os';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const HOST = process.env.HOST || '0.0.0.0';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const characters = [
  {
    id: 'harry-potter',
    name: 'Harry Potter',
    greeting: "Hello there! I'm Harry Potter. Looking for a bit of magic today?",
    personality: 'Brave, loyal, optimistic, slightly informal',
    background:
      'Wizard trained at Hogwarts. Known for courage, friendship, and a knack for getting into adventures.',
    speakingTips: 'Use references to magic, Hogwarts, and friendships.',
    voice: {
      pitch: 1.05,
      rate: 1.05
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

const allowCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
};

const sendJson = (res, statusCode, payload) => {
  const data = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  });
  res.end(data);
};

const readRequestBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

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
    .slice(-10); // keep recent 10 for cost control
};

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

const buildSystemPrompt = (character) => {
  if (!character) {
    return 'You are a friendly AI companion. Respond in two concise sentences.';
  }
  return `You are roleplaying as ${character.name}. Personality: ${character.personality}. Background: ${character.background}. Speaking tips: ${character.speakingTips}. Keep replies to 2-3 concise sentences, staying in character.`;
};

const callOpenAI = async ({ character, history, message }) => {
  if (!OPENAI_API_KEY) return null;

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
      temperature: 0.8,
      messages,
      max_tokens: 180
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

const server = http.createServer(async (req, res) => {
  try {
    allowCors(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const { method, url } = req;
    const parsedUrl = new URL(url, `http://${req.headers.host}`);

    if (method === 'GET' && parsedUrl.pathname === '/api/health') {
      sendJson(res, 200, {
        status: 'ok',
        uptime: process.uptime(),
        hostname: os.hostname()
      });
      return;
    }

    if (method === 'GET' && parsedUrl.pathname === '/api/characters') {
      sendJson(res, 200, { characters });
      return;
    }

    if (method === 'POST' && parsedUrl.pathname === '/api/chat') {
      let payload;
      try {
        payload = await readRequestBody(req);
      } catch (err) {
        sendJson(res, 400, { error: 'Invalid JSON payload.' });
        return;
      }

      const { characterId, message, history: rawHistory } = payload || {};
      const character = characters.find((item) => item.id === characterId) || characters[0];
      const trimmedMessage = (message || '').toString().trim();

      if (!trimmedMessage) {
        sendJson(res, 400, { error: 'Message is required.' });
        return;
      }

      const history = mapHistoryMessages(rawHistory);

      let reply;
      try {
        reply = await callOpenAI({ character, history, message: trimmedMessage });
      } catch (error) {
        console.warn('[chat] OpenAI fallback triggered:', error.message);
      }

      if (!reply) {
        reply = fallbackCharacterReply(character, trimmedMessage);
      }

      const responsePayload = {
        characterId: character.id,
        reply,
        voice: character.voice
      };

      sendJson(res, 200, responsePayload);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('Server error', error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Cosplay MVP backend listening on http://${HOST}:${PORT}`);
  if (!OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY not set. Using scripted fallback responses.');
  }
});
