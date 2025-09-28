import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fileUrl = new URL('../data/characters.json', import.meta.url);
const filePath = fileURLToPath(fileUrl);

let charactersCache = [];

const toNumberOrUndefined = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 60) || `character-${Date.now()}`;

const readFromDisk = async () => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error('characters file is not an array');
    }
    charactersCache = parsed;
  } catch (error) {
    if (error.code === 'ENOENT') {
      charactersCache = [];
      return;
    }
    throw error;
  }
};

const writeToDisk = async () => {
  const data = JSON.stringify(charactersCache, null, 2);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${data}\n`, 'utf8');
};

const ensureCharacterPayload = (payload, { isUpdate = false } = {}) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('角色数据格式不正确');
  }

  const { name, greeting, personality, background, speakingTips, voice = {} } = payload;
  if (!isUpdate) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new Error('角色名称不能为空');
    }
    if (!greeting || typeof greeting !== 'string' || !greeting.trim()) {
      throw new Error('角色问候语不能为空');
    }
  }

  if (voice && typeof voice !== 'object') {
    throw new Error('语音配置格式不正确');
  }

  const sanitized = {
    ...payload,
    name: name?.trim(),
    greeting: greeting?.trim(),
    personality: personality?.trim(),
    background: background?.trim(),
    speakingTips: speakingTips?.trim(),
    voice: {
      pitch: toNumberOrUndefined(voice.pitch),
      rate: toNumberOrUndefined(voice.rate)
    }
  };

  if (sanitized.voice.pitch === undefined) delete sanitized.voice.pitch;
  if (sanitized.voice.rate === undefined) delete sanitized.voice.rate;
  if (!Object.keys(sanitized.voice).length) {
    sanitized.voice = {};
  }

  return sanitized;
};

export const initCharacterStore = async () => {
  await readFromDisk();
  if (!charactersCache.length) {
    await writeToDisk();
  }
};

export const getCharacters = () => charactersCache;

export const findCharacterById = (id) => charactersCache.find((item) => item.id === id);

export const upsertCharacter = async (payload, existingId) => {
  const sanitized = ensureCharacterPayload(payload, { isUpdate: Boolean(existingId) });
  let targetId = existingId;

  if (!existingId) {
    targetId = sanitized.id?.trim() || slugify(sanitized.name);
    if (findCharacterById(targetId)) {
      throw new Error('角色ID已存在，请使用不同的名称');
    }
    const newCharacter = {
      id: targetId,
      name: sanitized.name,
      greeting: sanitized.greeting,
      personality: sanitized.personality || '',
      background: sanitized.background || '',
      speakingTips: sanitized.speakingTips || '',
      voice: sanitized.voice || {}
    };
    charactersCache.push(newCharacter);
    await writeToDisk();
    return newCharacter;
  }

  const index = charactersCache.findIndex((item) => item.id === existingId);
  if (index === -1) {
    throw new Error('要更新的角色不存在');
  }

  const current = charactersCache[index];
  const updated = {
    ...current,
    ...sanitized,
    id: existingId,
    voice: {
      ...current.voice,
      ...sanitized.voice
    }
  };

  charactersCache[index] = updated;
  await writeToDisk();
  return updated;
};

export const deleteCharacter = async (id) => {
  const index = charactersCache.findIndex((item) => item.id === id);
  if (index === -1) {
    throw new Error('要删除的角色不存在');
  }
  const [removed] = charactersCache.splice(index, 1);
  await writeToDisk();
  return removed;
};

export const ensureCharactersLoaded = async () => {
  if (!charactersCache.length) {
    await readFromDisk();
  }
};
