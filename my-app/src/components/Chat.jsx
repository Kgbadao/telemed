import { API_URL } from '../config';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Send, Paperclip, User, ChevronLeft, Loader2,
  AlertCircle, X, FileText, Image as ImageIcon, Check, CheckCheck
} from 'lucide-react';
import { io } from 'socket.io-client';


// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'long', day: 'numeric' });
}

function groupByDate(messages) {
  const groups = [];
  let lastDate = null;
  messages.forEach((msg) => {
    const date = formatDate(msg.createdAt);
    if (date !== lastDate) {
      groups.push({ type: 'date', label: date, key: `date-${msg.createdAt}` });
      lastDate = date;
    }
    groups.push({ type: 'message', ...msg });
  });
  return groups;
}

// ─── File Bubble ─────────────────────────────────────────────────────────────

function FileBubble({ msg, isMine }) {
  // Backend stores: fileUrl, fileName, fileType
  const isImage = msg.fileType?.startsWith('image/');
  if (isImage) {
    return (
      <img
        src={msg.fileUrl}
        alt={msg.fileName}
        className="max-w-[220px] rounded-xl border border-white/20 shadow mb-1"
      />
    );
  }
  return (
    <a
      href={msg.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium hover:underline underline-offset-2 mb-1 ${
        isMine ? 'text-white' : 'text-sky-700'
      }`}
    >
      <FileText className="w-4 h-4 shrink-0" />
      <span className="truncate max-w-[160px]">{msg.fileName}</span>
    </a>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────

function MessageBubble({ msg, isMine }) {
  const isFile = msg.type === 'file';
  return (
    <div className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isMine && (
        <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center shrink-0 mb-1">
          <User className="w-4 h-4 text-sky-600" />
        </div>
      )}

      <div className={`flex flex-col gap-1 max-w-[72%] ${isMine ? 'items-end' : 'items-start'}`}>
        {!isMine && (
          <span className="text-[11px] font-semibold text-sky-600 px-1">
            {msg.senderName || 'User'}
          </span>
        )}

        <div
          className={`px-4 py-2.5 rounded-2xl shadow-sm ${
            isMine
              ? 'bg-sky-600 text-white rounded-br-sm'
              : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm'
          }`}
        >
          {isFile && <FileBubble msg={msg} isMine={isMine} />}
          {msg.text && !msg.deleted && (
            <p className="text-sm leading-relaxed">{msg.text}</p>
          )}
          {msg.deleted && (
            <p className={`text-sm italic ${isMine ? 'text-sky-200' : 'text-slate-400'}`}>
              [Message deleted]
            </p>
          )}
        </div>

        <div className={`flex items-center gap-1 px-1 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-[10px] text-slate-400">{formatTime(msg.createdAt)}</span>
          {isMine && (
            (msg.readBy?.length > 1)
              ? <CheckCheck className="w-3 h-3 text-sky-500" />
              : <Check className="w-3 h-3 text-slate-400" />
          )}
          {msg.edited && (
            <span className="text-[10px] text-slate-400 italic">edited</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Typing Indicator ────────────────────────────────────────────────────────

function TypingIndicator({ names }) {
  if (!names.length) return null;
  return (
    <div className="flex items-center gap-2 px-2">
      <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
        <User className="w-4 h-4 text-sky-500" />
      </div>
      <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm">
        <div className="flex gap-1 items-center h-4">
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

// ─── File Preview Strip ──────────────────────────────────────────────────────

function FilePreviewStrip({ files, onRemove }) {
  if (!files.length) return null;
  return (
    <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex gap-2 flex-wrap">
      {files.map((f, i) => (
        <div
          key={i}
          className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 shadow-sm"
        >
          {f.file.type.startsWith('image/') ? (
            <ImageIcon className="w-3.5 h-3.5 text-sky-500" />
          ) : (
            <FileText className="w-3.5 h-3.5 text-sky-500" />
          )}
          <span className="max-w-[120px] truncate">{f.file.name}</span>
          <button onClick={() => onRemove(i)} className="ml-1 text-slate-400 hover:text-red-500">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main Chat ───────────────────────────────────────────────────────────────

export default function Chat({ currentUser }) {
  const { roomId } = useParams(); // Route must be: /chat/:roomId
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeout = useRef(null);

  const user = currentUser || JSON.parse(localStorage.getItem('user') || 'null');
  const token = localStorage.getItem('authToken');
  // Support both id formats your backend might return
  const myId = user?.id || user?.userId;

  // ── Fetch history ──────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/chat/${roomId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load messages');
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [roomId, token]);

  // ── Socket setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) {
      setError('No chat room specified. Please open chat from your appointment.');
      setLoading(false);
      return;
    }
    if (!token) {
      setError('Please log in to use chat.');
      setLoading(false);
      return;
    }

    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      // Backend: socket.on('join-room', (roomId) => { socket.join(roomId) })
      socket.emit('join-room', roomId);
      fetchHistory();
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('connect_error', () => {
      setError('Connection failed. Retrying…');
      setLoading(false);
    });

    // Backend emits new-message to the room — filter by roomId for safety
    socket.on('new-message', (message) => {
      if (String(message.roomId) !== String(roomId)) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      // Mark as read immediately
      socket.emit('mark-read', { roomId, messageId: message.id });
    });

    // Backend: socket.on('typing', (roomId) => {...}) — emits { userId, userName }
    socket.on('user-typing', ({ userId, userName }) => {
      if (String(userId) === String(myId)) return;
      setTypingUsers((prev) => prev.includes(userName) ? prev : [...prev, userName]);
    });

    socket.on('user-stop-typing', () => {
      setTypingUsers([]);
    });

    socket.on('message-read', ({ messageId, userId: readerId }) => {
      if (String(readerId) === String(myId)) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, readBy: [...new Set([...(m.readBy || []), readerId])] }
            : m
        )
      );
    });

    socket.on('message-deleted', ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, deleted: true, text: '[Message deleted]' } : m
        )
      );
    });

    socket.on('message-edited', ({ messageId, newText }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, text: newText, edited: true } : m
        )
      );
    });

    return () => {
      clearTimeout(typingTimeout.current);
      socket.disconnect();
    };
  }, [roomId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // ── Typing ─────────────────────────────────────────────────────────────────
  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    if (!socketRef.current || !isConnected) return;
    // Backend expects just roomId string: socket.on('typing', (roomId) => {...})
    socketRef.current.emit('typing', roomId);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socketRef.current?.emit('stop-typing', roomId);
    }, 1500);
  };

  // ── Files ──────────────────────────────────────────────────────────────────
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setPendingFiles((prev) => [...prev, ...files.map((file) => ({ file }))]);
    e.target.value = '';
  };

  const removeFile = (index) => setPendingFiles((prev) => prev.filter((_, i) => i !== index));

  // Upload to: POST /api/chat/:roomId/upload  (matches your backend exactly)
  const uploadFile = async (fileObj) => {
    const formData = new FormData();
    formData.append('file', fileObj.file);

    const res = await fetch(`${API_URL}/api/chat/${roomId}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return data.message; // backend returns the saved message object
  };

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = async (e) => {
    e?.preventDefault();
    const text = newMessage.trim();
    if ((!text && !pendingFiles.length) || !isConnected) return;

    clearTimeout(typingTimeout.current);
    socketRef.current?.emit('stop-typing', roomId);
    setNewMessage('');

    // Files: upload via REST (backend saves to Firestore + Firebase Storage)
    if (pendingFiles.length) {
      setUploadingFile(true);
      try {
        for (const fileObj of pendingFiles) {
          const savedMessage = await uploadFile(fileObj);
          // Backend REST upload doesn't socket-broadcast, so add locally
          if (savedMessage) {
            setMessages((prev) =>
              prev.some((m) => m.id === savedMessage.id) ? prev : [...prev, savedMessage]
            );
          }
        }
      } catch {
        setError('File upload failed. Please try again.');
        setTimeout(() => setError(null), 3000);
      } finally {
        setUploadingFile(false);
        setPendingFiles([]);
      }
    }

    // Text: send via socket
    // Backend: socket.on('send-message', async ({ roomId, text, replyTo }) => {...})
    if (text) {
      socketRef.current.emit('send-message', {
        roomId,
        text,
        replyTo: null,
      });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          <span className="text-sm font-medium">Loading conversation…</span>
        </div>
      </div>
    );
  }

  if (error && !isConnected && !messages.length) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="bg-white border border-red-100 rounded-2xl p-6 shadow flex flex-col items-center gap-3 max-w-sm text-center">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-slate-700 font-medium">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-2 px-4 py-2 bg-sky-600 text-white rounded-xl text-sm font-semibold hover:bg-sky-700 transition"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const grouped = groupByDate(messages);

  return (
    <div className="flex flex-col h-screen bg-slate-50">

      {/* Header */}
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-20 shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition">
          <ChevronLeft className="w-5 h-5 text-slate-500" />
        </button>

        <div className="relative">
          <div className="w-10 h-10 bg-sky-100 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-sky-600" />
          </div>
          <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${isConnected ? 'bg-emerald-400' : 'bg-slate-300'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-slate-800 text-[15px] leading-tight">Consultation</h2>
          <p className={`text-[11px] font-medium ${isConnected ? 'text-emerald-500' : 'text-slate-400'}`}>
            {isConnected ? 'Connected' : 'Reconnecting…'}
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-1.5 bg-red-50 text-red-500 text-xs font-medium px-3 py-1.5 rounded-full shrink-0">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 pb-10">
            <div className="w-14 h-14 bg-sky-50 rounded-full flex items-center justify-center">
              <Send className="w-6 h-6 text-sky-300" />
            </div>
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs">Send a message to start the consultation</p>
          </div>
        )}

        {grouped.map((item) =>
          item.type === 'date' ? (
            <div key={item.key} className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">{item.label}</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          ) : (
            <MessageBubble
              key={item.id || item.createdAt}
              msg={item}
              isMine={String(item.senderId) === String(myId)}
            />
          )
        )}

        <TypingIndicator names={typingUsers} />
        <div ref={messagesEndRef} />
      </main>

      {/* File preview strip */}
      <FilePreviewStrip files={pendingFiles} onRemove={removeFile} />

      {/* Input bar */}
      <footer className="bg-white border-t border-slate-100 px-4 py-3">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile}
            className="shrink-0 p-2.5 rounded-xl text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition disabled:opacity-40"
            title="Attach file"
          >
            {uploadingFile
              ? <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
              : <Paperclip className="w-5 h-5" />
            }
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/gif,.pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFileSelect}
          />

          <textarea
            value={newMessage}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none bg-slate-100 rounded-2xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 transition leading-relaxed"
            style={{ maxHeight: '8rem', overflowY: 'auto' }}
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={(!newMessage.trim() && !pendingFiles.length) || !isConnected || uploadingFile}
            className="shrink-0 w-10 h-10 flex items-center justify-center bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl transition shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}