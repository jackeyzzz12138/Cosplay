import React, { useEffect, useRef, useState } from 'react';
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

  const recognitionRef = useRef(null);
  const messagesRef = useRef([]);
  const selectedCharacterRef = useRef(null);
  const voiceSupportRef = useRef({ recognition: false, synthesis: false });
  const messageListRef = useRef(null);

  useEffect(() => {
    const loadCharacters = async () => {
      try {
        setLoadingCharacters(true);
        const response = await fetch(`${API_BASE_URL}/api/characters`);
        if (!response.ok) {
          throw new Error(`加载角色失败：${response.status}`);
        }
        const data = await response.json();
        setCharacters(data.characters || []);
      } catch (err) {
        console.error(err);
        setError('获取角色列表失败，请稍后重试。');
      } finally {
        setLoadingCharacters(false);
      }
    };

    loadCharacters();
  }, []);

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
        <h1>Cosplay Voice Chat MVP</h1>
        <p className="subtitle">选择角色并开启语音对话体验</p>
      </header>

      <main className="layout">
        <section className="characters-panel">
          <h2>选择角色</h2>
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
