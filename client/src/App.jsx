import React, { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const MessageBubble = ({ sender, text }) => (
  <div className={`message message-${sender}`}>
    <div className="message-bubble">
      <span>{text}</span>
    </div>
  </div>
);

const VoiceBadge = ({ recognition, synthesis }) => (
  <div className="voice-badge">
    <span className={recognition ? 'enabled' : 'disabled'}>🎙️ 语音识别{recognition ? '已启用' : '暂不支持'}</span>
    <span className={synthesis ? 'enabled' : 'disabled'}>🔊 语音合成{synthesis ? '已启用' : '暂不支持'}</span>
  </div>
);

const toChatHistory = (entries) =>
  entries.map((item) => ({
    role: item.sender === 'character' ? 'assistant' : 'user',
    content: item.text
  }));

const createEmptyCharacterForm = () => ({
  id: '',
  name: '',
  greeting: '',
  personality: '',
  background: '',
  speakingTips: '',
  voicePitch: '',
  voiceRate: ''
});

const toInputValue = (value) => (value === undefined || value === null ? '' : String(value));

function App() {
  const [characters, setCharacters] = useState([]);
  const [loadingCharacters, setLoadingCharacters] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupport, setVoiceSupport] = useState({ recognition: false, synthesis: false });
  const [isManaging, setIsManaging] = useState(false);
  const [managementForm, setManagementForm] = useState(createEmptyCharacterForm);
  const [editingCharacterId, setEditingCharacterId] = useState('');
  const [managementError, setManagementError] = useState('');
  const [managementNotice, setManagementNotice] = useState('');
  const [isSavingCharacter, setIsSavingCharacter] = useState(false);
  const [deletingCharacterId, setDeletingCharacterId] = useState('');

  const recognitionRef = useRef(null);
  const messagesRef = useRef([]);
  const selectedCharacterRef = useRef(null);
  const voiceSupportRef = useRef({ recognition: false, synthesis: false });
  const messageListRef = useRef(null);

  const loadCharacters = useCallback(async () => {
    try {
      setLoadingCharacters(true);
      const response = await fetch(`${API_BASE_URL}/api/characters`);
      if (!response.ok) {
        throw new Error(`加载角色失败：${response.status}`);
      }
      const data = await response.json();
      const list = data.characters || [];
      setCharacters(list);

      const currentId = selectedCharacterRef.current?.id;
      if (currentId) {
        const updated = list.find((item) => item.id === currentId);
        if (updated) {
          setSelectedCharacter(updated);
        } else {
          setSelectedCharacter(null);
          messagesRef.current = [];
          setMessages([]);
        }
      }

      return list;
    } catch (err) {
      console.error(err);
      setError('获取角色列表失败，请稍后重试。');
      throw err;
    } finally {
      setLoadingCharacters(false);
    }
  }, [messagesRef, selectedCharacterRef]);

  useEffect(() => {
    loadCharacters().catch(() => {});
  }, [loadCharacters]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    selectedCharacterRef.current = selectedCharacter;
  }, [selectedCharacter]);

  useEffect(() => {
    voiceSupportRef.current = voiceSupport;
  }, [voiceSupport]);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; // speech recognition API
    const hasRecognition = Boolean(SpeechRecognition);
    const hasSynthesis = typeof window.speechSynthesis !== 'undefined';

    setVoiceSupport({ recognition: hasRecognition, synthesis: hasSynthesis });

    if (!hasRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) {
        return;
      }

      const newEntry = { sender: 'user', text: transcript };
      messagesRef.current = [...messagesRef.current, newEntry];
      setMessages((prev) => [...prev, newEntry]);
      sendMessage(transcript, messagesRef.current);
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error', event.error);
      setError('语音识别出现问题，请重试或使用文本输入。');
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    return () => {
      recognition.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // TTS 函数
  const speakReply = (text, voice) => {
    if (!voiceSupportRef.current.synthesis || !text) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (voice?.pitch) {
      utterance.pitch = voice.pitch;
    }
    if (voice?.rate) {
      utterance.rate = voice.rate;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const sendMessage = async (text, pendingHistory) => {
    const trimmed = text.trim();
    if (!trimmed || !selectedCharacterRef.current) {
      return;
    }

    setIsSending(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          characterId: selectedCharacterRef.current.id,
          message: trimmed,
          history: toChatHistory(pendingHistory)
        })
      });

      if (!response.ok) {
        throw new Error(`服务器返回错误：${response.status}`);
      }

      const data = await response.json();
      const replyText = data.reply?.trim();
      if (replyText) {
        const characterMessage = { sender: 'character', text: replyText };
        messagesRef.current = [...messagesRef.current, characterMessage];
        setMessages((prev) => [...prev, characterMessage]);
        speakReply(replyText, data.voice); // TTS语音参数
      }
    } catch (err) {
      console.error(err);
      setError('发送消息失败，请稍后重试。');
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectCharacter = (character) => {
    setSelectedCharacter(character);
    setError('');
    const greeting = character?.greeting?.trim();
    const history = greeting ? [{ sender: 'character', text: greeting }] : [];
    messagesRef.current = history;
    setMessages(history);
  };

  const handleToggleManagement = () => {
    setIsManaging((prev) => {
      const next = !prev;
      if (!next) {
        setEditingCharacterId('');
        setManagementForm(createEmptyCharacterForm());
      }
      return next;
    });
    setManagementError('');
    setManagementNotice('');
  };

  const startCreateCharacter = () => {
    setIsManaging(true);
    setEditingCharacterId('');
    setManagementForm(createEmptyCharacterForm());
    setManagementError('');
    setManagementNotice('');
  };

  const handleManagementChange = (field) => (event) => {
    const value = event.target.value;
    setManagementForm((prev) => ({ ...prev, [field]: value }));
  };

  const openEditCharacter = (character) => {
    setIsManaging(true);
    setEditingCharacterId(character.id);
    setManagementForm({
      id: character.id || '',
      name: character.name || '',
      greeting: character.greeting || '',
      personality: character.personality || '',
      background: character.background || '',
      speakingTips: character.speakingTips || '',
      voicePitch: toInputValue(character.voice?.pitch),
      voiceRate: toInputValue(character.voice?.rate)
    });
    setManagementError('');
    setManagementNotice('');
  };

  const submitManagementForm = async (event) => {
    event.preventDefault();
    const trimmedName = managementForm.name.trim();
    const trimmedGreeting = managementForm.greeting.trim();

    if (!trimmedName || !trimmedGreeting) {
      setManagementError('角色名称和问候语为必填项。');
      return;
    }

    const parseNumericField = (value) => {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }
      const num = Number(value);
      if (!Number.isFinite(num)) {
        throw new Error('字段需要填写数字');
      }
      return num;
    };

    let pitch;
    let rate;
    try {
      pitch = parseNumericField(managementForm.voicePitch);
      rate = parseNumericField(managementForm.voiceRate);
    } catch (err) {
      setManagementError('语音音调与语速需要填写数字。');
      return;
    }

    const payload = {
      name: trimmedName,
      greeting: trimmedGreeting,
      personality: managementForm.personality.trim(),
      background: managementForm.background.trim(),
      speakingTips: managementForm.speakingTips.trim(),
      voice: {}
    };

    if (pitch !== undefined) {
      payload.voice.pitch = pitch;
    }
    if (rate !== undefined) {
      payload.voice.rate = rate;
    }
    if (!Object.keys(payload.voice).length) {
      delete payload.voice;
    }

    if (!editingCharacterId && managementForm.id.trim()) {
      payload.id = managementForm.id.trim();
    }

    setIsSavingCharacter(true);
    setManagementError('');
    setManagementNotice('');

    try {
      const endpoint = editingCharacterId
        ? `${API_BASE_URL}/api/characters/${encodeURIComponent(editingCharacterId)}`
        : `${API_BASE_URL}/api/characters`;
      const method = editingCharacterId ? 'PUT' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message = errorBody.error || '保存角色失败，请稍后重试。';
        throw new Error(message);
      }

      const data = await response.json();
      const savedCharacter = data.character;
      await loadCharacters();

      setManagementNotice(editingCharacterId ? '角色已更新。' : '角色已新增。');
      setManagementForm({
        id: savedCharacter.id || '',
        name: savedCharacter.name || '',
        greeting: savedCharacter.greeting || '',
        personality: savedCharacter.personality || '',
        background: savedCharacter.background || '',
        speakingTips: savedCharacter.speakingTips || '',
        voicePitch: toInputValue(savedCharacter.voice?.pitch),
        voiceRate: toInputValue(savedCharacter.voice?.rate)
      });
      setEditingCharacterId(savedCharacter.id);

      if (!editingCharacterId || selectedCharacterRef.current?.id === savedCharacter.id) {
        handleSelectCharacter(savedCharacter);
      }
    } catch (err) {
      console.error(err);
      setManagementError(err.message || '保存角色失败，请稍后重试。');
    } finally {
      setIsSavingCharacter(false);
    }
  };

  const removeCharacter = async (character) => {
    if (!window.confirm(`确定要删除「${character.name}」吗？`)) {
      return;
    }

    setManagementError('');
    setManagementNotice('');
    setDeletingCharacterId(character.id);

    try {
      const response = await fetch(`${API_BASE_URL}/api/characters/${encodeURIComponent(character.id)}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message = errorBody.error || '删除角色失败，请稍后重试。';
        throw new Error(message);
      }

      await loadCharacters();

      if (editingCharacterId === character.id) {
        setEditingCharacterId('');
        setManagementForm(createEmptyCharacterForm());
      }

      if (selectedCharacterRef.current?.id === character.id) {
        setSelectedCharacter(null);
        messagesRef.current = [];
        setMessages([]);
      }

      setManagementNotice('角色已删除。');
    } catch (err) {
      console.error(err);
      setManagementError(err.message || '删除角色失败，请稍后重试。');
    } finally {
      setDeletingCharacterId('');
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || !selectedCharacter) {
      return;
    }

    const newEntry = { sender: 'user', text: trimmed };
    const newHistory = [...messagesRef.current, newEntry];
    messagesRef.current = newHistory;
    setMessages((prev) => [...prev, newEntry]);
    setInputValue('');
    sendMessage(trimmed, newHistory);
  };

  const handleStartRecording = () => {
    if (!voiceSupport.recognition || !recognitionRef.current || !selectedCharacter) {
      return;
    }
    setError('');
    try {
      recognitionRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      setError('无法启动语音识别，请稍后重试。');
      setIsRecording(false);
    }
  };

  const handleStopRecording = () => {
    if (!voiceSupport.recognition || !recognitionRef.current) {
      return;
    }
    recognitionRef.current.stop();
    setIsRecording(false);
  };

  return (
    <div className="app-shell">
      <header>
        <h1>Cosplay Voice Chat</h1>
        <p className="subtitle">选择角色并开启语音对话体验</p>
      </header>

      <main className="layout">
        <section className="characters-panel">
          <div className="panel-header">
            <h2>选择角色</h2>
            <button className="toggle-management" type="button" onClick={handleToggleManagement}>
              {isManaging ? '关闭管理' : '管理角色'}
            </button>
          </div>

          <div className="character-grid">
            {loadingCharacters && <div className="placeholder">正在加载角色...</div>}
            {!loadingCharacters && !characters.length && <div className="placeholder">暂无角色可用</div>}
            {!loadingCharacters &&
              characters.map((character) => (
                <button
                  key={character.id}
                  className={`character-card ${selectedCharacter?.id === character.id ? 'active' : ''}`}
                  onClick={() => handleSelectCharacter(character)}
                  type="button"
                >
                  <h3>{character.name}</h3>
                  <p>{character.background}</p>
                  <small>{character.personality}</small>
                </button>
              ))}
          </div>

          {isManaging && (
            <div className="character-management">
              <div className="management-header">
                <h3>{editingCharacterId ? '编辑角色' : '新增角色'}</h3>
                <button type="button" className="secondary" onClick={startCreateCharacter}>
                  新增角色
                </button>
              </div>

              {managementError && <div className="management-message error">{managementError}</div>}
              {managementNotice && <div className="management-message notice">{managementNotice}</div>}

              <form className="management-form" onSubmit={submitManagementForm}>
                <div className="form-grid">
                  <label className="field">
                    <span>角色名称 *</span>
                    <input
                      type="text"
                      value={managementForm.name}
                      onChange={handleManagementChange('name')}
                      placeholder="如：Sherlock Holmes"
                    />
                  </label>
                  <label className="field">
                    <span>角色 ID</span>
                    <input
                      type="text"
                      value={managementForm.id}
                      onChange={handleManagementChange('id')}
                      placeholder="留空将自动生成"
                      disabled={Boolean(editingCharacterId)}
                    />
                  </label>
                  <label className="field full">
                    <span>问候语 *</span>
                    <textarea
                      value={managementForm.greeting}
                      onChange={handleManagementChange('greeting')}
                      rows={2}
                      placeholder="例如：很高兴见到你，准备好探险了吗？"
                    />
                  </label>
                  <label className="field full">
                    <span>角色背景</span>
                    <textarea
                      value={managementForm.background}
                      onChange={handleManagementChange('background')}
                      rows={3}
                      placeholder="可描述角色的身份、历史等"
                    />
                  </label>
                  <label className="field full">
                    <span>性格特点</span>
                    <input
                      type="text"
                      value={managementForm.personality}
                      onChange={handleManagementChange('personality')}
                      placeholder="如：机智、冷静、善于分析"
                    />
                  </label>
                  <label className="field full">
                    <span>对话提示</span>
                    <textarea
                      value={managementForm.speakingTips}
                      onChange={handleManagementChange('speakingTips')}
                      rows={2}
                      placeholder="提示 AI 如何回复，例如：多使用古典语言"
                    />
                  </label>
                  <label className="field">
                    <span>语音音调</span>
                    <input
                      type="number"
                      step="0.05"
                      value={managementForm.voicePitch}
                      onChange={handleManagementChange('voicePitch')}
                      placeholder="如：1.05"
                    />
                  </label>
                  <label className="field">
                    <span>语速</span>
                    <input
                      type="number"
                      step="0.05"
                      value={managementForm.voiceRate}
                      onChange={handleManagementChange('voiceRate')}
                      placeholder="如：0.95"
                    />
                  </label>
                </div>
                <div className="management-actions">
                  <button type="submit" className="primary" disabled={isSavingCharacter}>
                    {isSavingCharacter ? '保存中...' : '保存角色'}
                  </button>
                </div>
              </form>

              <div className="management-list">
                <h4>已有角色</h4>
                {!characters.length && <div className="placeholder">暂无角色，请先新增。</div>}
                {characters.map((character) => (
                  <div
                    key={`manage-${character.id}`}
                    className={`management-item ${editingCharacterId === character.id ? 'active' : ''}`}
                  >
                    <div className="info">
                      <strong>{character.name}</strong>
                      <span>ID：{character.id}</span>
                    </div>
                    <div className="actions">
                      <button type="button" onClick={() => openEditCharacter(character)}>
                        编辑
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => removeCharacter(character)}
                        disabled={deletingCharacterId === character.id}
                      >
                        {deletingCharacterId === character.id ? '删除中...' : '删除'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="chat-panel">
          <div className="chat-header">
            <div>
              <h2>{selectedCharacter ? selectedCharacter.name : '等待选择角色'}</h2>
              <p className="chat-description">
                {selectedCharacter ? selectedCharacter.speakingTips : '从左侧列表中选择一个角色开始对话。'}
              </p>
            </div>
            <VoiceBadge {...voiceSupport} />
          </div>

          <div className="messages" ref={messageListRef}>
            {messages.length === 0 ? (
              <div className="placeholder">
                {selectedCharacter
                  ? '发送消息或点击麦克风和角色对话。'
                  : '请选择一个角色以查看对话内容。'}
              </div>
            ) : (
              messages.map((message, index) => (
                <MessageBubble key={`${message.sender}-${index}`} sender={message.sender} text={message.text} />
              ))
            )}
          </div>

          {error && <div className="error-banner">{error}</div>}

          <form className="composer" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder={selectedCharacter ? '输入消息...' : '请先选择一个角色'}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              disabled={!selectedCharacter || isSending}
            />
            <div className="composer-actions">
              {voiceSupport.recognition && (
                <button
                  type="button"
                  className={`mic-button ${isRecording ? 'recording' : ''}`}
                  onClick={isRecording ? handleStopRecording : handleStartRecording}
                  disabled={!selectedCharacter}
                >
                  {isRecording ? '停止' : '🎤 语音'}
                </button>
              )}
              <button type="submit" className="send-button" disabled={!selectedCharacter || isSending}>
                {isSending ? '发送中...' : '发送'}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

export default App;
