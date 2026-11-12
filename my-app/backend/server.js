import 'dotenv/config'; // must be first so env vars are loaded before anything else runs
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { OAuth2Client } from 'google-auth-library';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import xss from 'xss';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import path from 'path';

// ========================================
// Environment validation (fail fast, with clear messages)
// ========================================
const REQUIRED_ENV = [
  'JWT_SECRET',
  'FIREBASE_SERVICE_ACCOUNT',
  'FIREBASE_STORAGE_BUCKET',
  'GOOGLE_CLIENT_ID',
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ FATAL: missing environment variables: ${missing.join(', ')}`);
  console.error('   On Render, set these under your service > Environment. Render does not read your local .env file.');
  process.exit(1);
}

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();

// Render (and most hosts) sit behind a proxy. Without this, every visitor
// looks like the same IP and rate limiting breaks.
app.set('trust proxy', 1);

// ========================================
// CORS
// ========================================
// FRONTEND_URL can be one URL or several, comma-separated.
// Trailing slashes are removed because browsers never send them in Origin.
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  ...(process.env.FRONTEND_URL || '').split(','),
]
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // curl, server-to-server, health checks
      if (allowedOrigins.includes(origin)) return callback(null, true);
      console.warn(`⚠️  CORS blocked origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
// Note: the cors() middleware above already answers OPTIONS preflights.
// The old app.options(/.*/, cors()) allowed preflight from ANY origin, so it was removed.

// ========================================
// HTTP server & Socket.io
// ========================================
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ========================================
// Firebase Admin (Firestore + Storage)
// ========================================
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  // When the JSON is pasted into an env var, newlines in the private key often
  // become the literal two characters "\n". Convert them back or auth fails with
  // "16 UNAUTHENTICATED".
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
} catch (err) {
  console.error('❌ FATAL: FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the whole key file as one value.');
  process.exit(1);
}

initializeApp({
  credential: cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const db = getFirestore();
const bucket = getStorage().bucket();

// Startup check: if the service account key is deleted, disabled, or mangled,
// say so loudly right away instead of failing on the first login.
(async () => {
  try {
    await db.collection('users').limit(1).get();
    console.log(`✅ Firestore connected (project: ${serviceAccount.project_id})`);
  } catch (err) {
    console.error('❌ Firestore connection FAILED. Your service account key is probably deleted, disabled, or for the wrong project.');
    console.error('   Generate a new key in Firebase console > Project settings > Service accounts, then update FIREBASE_SERVICE_ACCOUNT on Render.');
    console.error('   Details:', err.message);
  }
})();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ========================================
// General middleware
// ========================================
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '100kb' }));

// 100 requests per minute per IP on all /api/ routes
app.use(
  '/api/',
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Stricter limit for auth and other public write endpoints: 20 per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ========================================
// File upload
// ========================================
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);
const ALLOWED_EXT = new Set(['.jpeg', '.jpg', '.png', '.gif', '.pdf', '.doc', '.docx', '.txt']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIME.has(file.mimetype) && ALLOWED_EXT.has(ext)) return cb(null, true);
    cb(new Error('Invalid file type'));
  },
});

// ========================================
// Helpers
// ========================================
const sanitizeInput = (text) =>
  xss(String(text ?? ''), { whiteList: {}, stripIgnoreTag: true });

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Finds a user by email. Tries the lowercase form first, then the raw input,
// so accounts created before emails were normalized still work.
const findUserByEmail = async (rawEmail) => {
  const normalized = normalizeEmail(rawEmail);
  let snap = await db.collection('users').where('email', '==', normalized).limit(1).get();
  if (snap.empty && rawEmail !== normalized) {
    snap = await db.collection('users').where('email', '==', rawEmail).limit(1).get();
  }
  return snap.empty ? null : snap.docs[0];
};

// Signed JWT, expires in 7 days. The frontend sends it as a Bearer token.
const signToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

// Verifies the JWT and puts { uid, email, name, role } on req.user
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expired, please login again' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Admin only. To make an admin: set role = "admin" on that user's document in
// Firestore, then log in again to get a fresh token.
const verifyAdmin = [
  verifyToken,
  (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  },
];

// The user must be the patient or doctor on the appointment (roomId === appointmentId)
const verifyRoomMembership = async (userId, roomId) => {
  if (!roomId || typeof roomId !== 'string') return false;
  const apptDoc = await db.collection('appointments').doc(roomId).get();
  if (!apptDoc.exists) return false;
  const appt = apptDoc.data();
  return appt.patientId === userId || appt.doctorId === userId;
};

const messagesRef = (roomId) => db.collection('chatRooms').doc(roomId).collection('messages');

// ========================================
// Socket.io auth (same JWT as the REST API)
// ========================================
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Auth error: No token provided'));
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.uid;
    socket.userEmail = decoded.email || '';
    socket.userName = decoded.name || decoded.email || 'Anonymous';
    next();
  } catch {
    next(new Error('Auth error: Invalid or expired token'));
  }
});

// ========================================
// Socket.io: real-time chat
// ========================================
const activeUsers = new Map(); // socket.id -> user info
const typingUsers = new Map(); // socket.id -> { roomId, userName }

// Every room-scoped event must come from a socket that already passed the
// membership check in 'join-room'.
const inRoom = (socket, roomId) => typeof roomId === 'string' && socket.rooms.has(roomId);

io.on('connection', (socket) => {
  console.log(`✅ Socket connected: ${socket.userId} (${socket.id})`);

  activeUsers.set(socket.id, {
    socketId: socket.id,
    userId: socket.userId,
    userName: socket.userName,
    userEmail: socket.userEmail,
    lastSeen: new Date(),
  });

  socket.on('join-room', async (roomId) => {
    try {
      const isMember = await verifyRoomMembership(socket.userId, roomId);
      if (!isMember) {
        socket.emit('error', { message: 'You do not have access to this room' });
        return;
      }
      socket.join(roomId);
      socket.currentRoom = roomId;

      io.to(roomId).emit('user-joined', {
        userId: socket.userId,
        userName: socket.userName,
        timestamp: new Date(),
      });

      const roomSockets = io.sockets.adapter.rooms.get(roomId);
      const roomUsers = Array.from(activeUsers.values()).filter((u) => roomSockets?.has(u.socketId));
      socket.emit('room-users', roomUsers);
    } catch (err) {
      console.error('join-room error:', err);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('send-message', async (data) => {
    try {
      const { roomId, text, replyTo } = data || {};
      if (!roomId || !text) {
        socket.emit('error', { message: 'roomId and text are required' });
        return;
      }
      if (!inRoom(socket, roomId)) {
        socket.emit('error', { message: 'Not a member of this room' });
        return;
      }

      const sanitizedText = sanitizeInput(text);
      if (!sanitizedText || sanitizedText.length > 5000) {
        socket.emit('error', { message: 'Invalid message length (max 5000 chars)' });
        return;
      }

      const message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        roomId,
        senderId: socket.userId,
        senderName: socket.userName,
        text: sanitizedText,
        replyTo: replyTo || null,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        deleted: false,
        edited: false,
        reactions: {},
        readBy: [socket.userId],
        deliveredTo: [socket.userId],
        status: 'delivered',
      };

      await messagesRef(roomId).doc(message.id).set(message);
      io.to(roomId).emit('new-message', message);
      socket.emit('message-delivered', { messageId: message.id });
      typingUsers.delete(socket.id);
      io.to(roomId).emit('user-stop-typing', { userId: socket.userId });
    } catch (error) {
      console.error('send-message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('typing', (roomId) => {
    if (!inRoom(socket, roomId)) return;
    typingUsers.set(socket.id, { roomId, userName: socket.userName });
    socket.to(roomId).emit('user-typing', { userId: socket.userId, userName: socket.userName });
  });

  socket.on('stop-typing', (roomId) => {
    if (!inRoom(socket, roomId)) return;
    typingUsers.delete(socket.id);
    socket.to(roomId).emit('user-stop-typing', { userId: socket.userId });
  });

  socket.on('mark-read', async ({ roomId, messageId } = {}) => {
    try {
      if (!inRoom(socket, roomId) || !messageId) return;
      await messagesRef(roomId).doc(String(messageId)).update({
        readBy: FieldValue.arrayUnion(socket.userId),
      });
      io.to(roomId).emit('message-read', { messageId, userId: socket.userId });
    } catch (error) {
      console.error('mark-read error:', error);
    }
  });

  socket.on('edit-message', async ({ roomId, messageId, newText } = {}) => {
    try {
      if (!inRoom(socket, roomId) || !messageId) {
        socket.emit('error', { message: 'Not a member of this room' });
        return;
      }
      const sanitizedText = sanitizeInput(newText);
      if (!sanitizedText || sanitizedText.length > 5000) {
        socket.emit('error', { message: 'Invalid message text' });
        return;
      }
      const ref = messagesRef(roomId).doc(String(messageId));
      const doc = await ref.get();
      if (!doc.exists || doc.data().senderId !== socket.userId) {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }
      await ref.update({ text: sanitizedText, edited: true, updatedAt: new Date().toISOString() });
      io.to(roomId).emit('message-edited', { messageId, newText: sanitizedText, edited: true });
    } catch (error) {
      console.error('edit-message error:', error);
      socket.emit('error', { message: 'Failed to edit message' });
    }
  });

  socket.on('delete-message', async ({ roomId, messageId } = {}) => {
    try {
      if (!inRoom(socket, roomId) || !messageId) {
        socket.emit('error', { message: 'Not a member of this room' });
        return;
      }
      const ref = messagesRef(roomId).doc(String(messageId));
      const doc = await ref.get();
      if (!doc.exists || doc.data().senderId !== socket.userId) {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }
      await ref.update({ deleted: true, text: '[Message deleted]', updatedAt: new Date().toISOString() });
      io.to(roomId).emit('message-deleted', { messageId });
    } catch (error) {
      console.error('delete-message error:', error);
      socket.emit('error', { message: 'Failed to delete message' });
    }
  });

  socket.on('add-reaction', async ({ roomId, messageId, emoji } = {}) => {
    try {
      if (!inRoom(socket, roomId) || !messageId) return;
      if (!emoji || typeof emoji !== 'string' || emoji.length > 10) {
        socket.emit('error', { message: 'Invalid emoji' });
        return;
      }
      // FieldPath treats the emoji as a single key (a plain "reactions.<emoji>"
      // string would break on characters like ".").
      await messagesRef(roomId)
        .doc(String(messageId))
        .update(new FieldPath('reactions', emoji), FieldValue.arrayUnion(socket.userId));
      io.to(roomId).emit('reaction-added', { messageId, emoji, userId: socket.userId });
    } catch (error) {
      console.error('add-reaction error:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected: ${socket.userId} (${socket.id})`);
    if (socket.currentRoom) {
      io.to(socket.currentRoom).emit('user-left', {
        userId: socket.userId,
        userName: socket.userName,
        timestamp: new Date(),
      });
    }
    activeUsers.delete(socket.id);
    typingUsers.delete(socket.id);
  });
});

// ========================================
// Health check (Render can ping this, and so can an uptime monitor)
// ========================================
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// ========================================
// 🔐 Auth routes
// ========================================
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, password, role = 'patient', specialization, licenseNumber, licenseURL } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      return res.status(400).json({ message: 'Password must be between 6 and 128 characters' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (!['patient', 'doctor'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (role === 'doctor' && (!specialization || !licenseNumber || !licenseURL)) {
      return res.status(400).json({
        message: 'specialization, licenseNumber, and licenseURL are required for doctors',
      });
    }

    if (await findUserByEmail(email)) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = {
      name: sanitizeInput(name),
      email,
      password: hashedPassword,
      provider: 'email',
      role,
      createdAt: new Date().toISOString(),
    };
    if (role === 'doctor') {
      newUser.specialization = sanitizeInput(specialization);
      newUser.licenseNumber = sanitizeInput(licenseNumber);
      newUser.licenseURL = sanitizeInput(licenseURL);
      newUser.status = 'pending';
    }

    const docRef = await db.collection('users').add(newUser);
    const token = signToken({ uid: docRef.id, email, name: newUser.name, role });

    res.status(201).json({
      message: 'Registration successful',
      userId: docRef.id,
      token,
      name: newUser.name,
      email,
      role,
      status: newUser.status || 'active',
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || typeof password !== 'string') {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const userDoc = await findUserByEmail(email);
    if (!userDoc) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const userData = userDoc.data();

    // Accounts created through Google have no password. Without this check,
    // bcrypt.compare(password, undefined) throws and returns a confusing 500.
    if (!userData.password) {
      return res.status(401).json({ message: 'This account uses Google sign-in. Please continue with Google.' });
    }

    const passwordMatch = await bcrypt.compare(password, userData.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const role = userData.role || 'patient';
    const token = signToken({ uid: userDoc.id, email: userData.email, name: userData.name, role });

    res.status(200).json({
      message: 'Login successful',
      userId: userDoc.id,
      name: userData.name,
      email: userData.email,
      role,
      status: userData.status || 'active',
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Google sign-in.
// Step 1 verifies the Google token (a failure here really is a 401).
// Step 2 does the database work (a failure here is a 500, not "Invalid Google token").
app.post('/api/auth/google', authLimiter, async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ message: 'Missing token' });
  }

  // Step 1: verify with Google
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error('Google token verification failed:', err.message);
    return res.status(401).json({ message: 'Invalid Google token' });
  }

  if (!payload?.email || !payload.email_verified) {
    return res.status(401).json({ message: 'Google account email is not verified' });
  }

  // Step 2: find or create the user
  try {
    const email = normalizeEmail(payload.email);
    const name = sanitizeInput(payload.name || email);
    const picture = payload.picture || null;

    const existing = await findUserByEmail(email);

    let userId;
    let role;
    let status;
    if (!existing) {
      const docRef = await db.collection('users').add({
        name,
        email,
        picture,
        provider: 'google',
        role: 'patient',
        createdAt: new Date().toISOString(),
      });
      userId = docRef.id;
      role = 'patient';
      status = 'active';
    } else {
      const data = existing.data();
      userId = existing.id;
      role = data.role || 'patient';
      status = data.status || 'active';
    }

    const jwtToken = signToken({ uid: userId, email, name, role });
    res.status(200).json({
      message: 'Google user authenticated',
      name,
      email,
      userId,
      role,
      status,
      token: jwtToken,
    });
  } catch (err) {
    console.error('Google sign-in database error:', err);
    res.status(500).json({ message: 'Server error during Google sign-in' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.status(200).json({ message: 'Logged out successfully' });
});

// ========================================
// 👤 User routes
// ========================================
app.get('/api/user/me', verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
    const { password: _removed, ...safeData } = userDoc.data();
    res.json({ id: userDoc.id, ...safeData });
  } catch (error) {
    console.error('GET /api/user/me error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.put('/api/user/me', verifyToken, async (req, res) => {
  try {
    const { name, phone, bio } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = sanitizeInput(name);
    if (phone !== undefined) updates.phone = sanitizeInput(phone);
    if (bio !== undefined) updates.bio = sanitizeInput(bio);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.updatedAt = new Date().toISOString();
    await db.collection('users').doc(req.user.uid).update(updates);
    res.json({ message: 'Profile updated', updates });
  } catch (error) {
    console.error('PUT /api/user/me error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ========================================
// 💬 Chat routes
// ========================================
app.get('/api/chat/:roomId/messages', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    if (!(await verifyRoomMembership(req.user.uid, roomId))) {
      return res.status(403).json({ error: 'Access denied to this chat room' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const lastMessageId = req.query.lastMessageId;

    let query = messagesRef(roomId).orderBy('createdAt', 'desc').limit(limit);
    if (lastMessageId) {
      const lastDoc = await messagesRef(roomId).doc(String(lastMessageId)).get();
      if (lastDoc.exists) query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    const messages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ messages: messages.reverse(), hasMore: messages.length === limit });
  } catch (error) {
    console.error('GET messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/api/chat/:roomId/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const { roomId } = req.params;

    if (!(await verifyRoomMembership(req.user.uid, roomId))) {
      return res.status(403).json({ error: 'Access denied to this chat room' });
    }

    const safeFileName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const file = bucket.file(`chat-files/${roomId}/${Date.now()}_${safeFileName}`);

    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
        metadata: { uploadedBy: req.user.uid, originalName: req.file.originalname },
      },
    });

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      roomId,
      senderId: req.user.uid,
      senderName: req.user.name || req.user.email,
      type: 'file',
      fileUrl: url,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      createdAt: new Date().toISOString(),
      deleted: false,
      readBy: [req.user.uid],
    };

    await messagesRef(roomId).doc(message.id).set(message);
    res.json({ success: true, url, message });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/chat/:roomId/search', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const query = String(req.query.query || '');

    if (query.length < 2 || query.length > 100) {
      return res.status(400).json({ error: 'Query must be between 2 and 100 characters' });
    }
    if (!(await verifyRoomMembership(req.user.uid, roomId))) {
      return res.status(403).json({ error: 'Access denied to this chat room' });
    }

    const snapshot = await messagesRef(roomId).where('deleted', '==', false).get();
    const needle = query.toLowerCase();
    const messages = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((msg) => msg.text?.toLowerCase().includes(needle));

    res.json({ messages });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ========================================
// 🩺 Doctor routes
// ========================================
// Active (approved) doctors with their real Firestore IDs
app.get('/api/doctors', verifyToken, async (req, res) => {
  try {
    const snapshot = await db
      .collection('users')
      .where('role', '==', 'doctor')
      .where('status', '==', 'active')
      .get();

    const doctors = snapshot.docs.map((doc) => {
      const safe = doc.data();
      return {
        id: doc.id,
        name: safe.name || 'Unknown',
        specialty: safe.specialization || 'General Practice',
        experience: safe.experience || '',
        location: safe.location || '',
        rating: safe.rating || null,
        picture: safe.picture || null,
      };
    });
    res.status(200).json(doctors);
  } catch (error) {
    console.error('GET /api/doctors error:', error);
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

// POST /api/doctor/register (multipart/form-data)
// Uploads the license through the Admin SDK, so Storage rules don't apply.
// Uses a v4 signed URL (makePublic fails with uniform bucket-level access).
// V4 URLs can't expire more than 7 days out.
app.post(
  '/api/doctor/register',
  authLimiter,
  (req, res, next) => {
    upload.single('licenseFile')(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'License file must be under 10MB' });
        }
        return res.status(400).json({ message: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ message: err.message || 'Invalid file upload' });
    });
  },
  async (req, res) => {
    try {
      const { name, password, specialization, licenseNumber } = req.body;
      const email = normalizeEmail(req.body.email);

      if (!name || !email || !password || !specialization || !licenseNumber) {
        return res.status(400).json({ message: 'All fields are required' });
      }
      if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
        return res.status(400).json({ message: 'Password must be between 6 and 128 characters' });
      }
      if (!isValidEmail(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }
      if (!req.file) {
        return res.status(400).json({ message: 'Medical license file is required' });
      }

      if (await findUserByEmail(email)) {
        return res.status(409).json({ message: 'An account with this email already exists' });
      }

      const safeFileName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileRef = bucket.file(`licenses/${Date.now()}_${safeFileName}`);

      await fileRef.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
          metadata: { uploadedBy: email },
        },
      });

      const [licenseURL] = await fileRef.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      const hashedPassword = await bcrypt.hash(password, 12);
      const newUser = {
        name: sanitizeInput(name),
        email,
        password: hashedPassword,
        provider: 'email',
        role: 'doctor',
        specialization: sanitizeInput(specialization),
        licenseNumber: sanitizeInput(licenseNumber),
        licenseURL,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const docRef = await db.collection('users').add(newUser);
      const token = signToken({ uid: docRef.id, email, name: newUser.name, role: 'doctor' });

      res.status(201).json({
        message: 'Registration submitted. Your credentials are under review.',
        userId: docRef.id,
        token,
        name: newUser.name,
        email,
        role: 'doctor',
        status: 'pending',
      });
    } catch (error) {
      console.error('Doctor registration error:', error);
      res.status(500).json({ message: 'Server error during registration' });
    }
  }
);

// ========================================
// 🛡️ Admin routes
// ========================================
app.get('/api/admin/pending-doctors', verifyAdmin, async (req, res) => {
  try {
    const snapshot = await db
      .collection('users')
      .where('role', '==', 'doctor')
      .where('status', '==', 'pending')
      .get();
    const doctors = snapshot.docs.map((doc) => {
      const { password: _pw, ...safe } = doc.data();
      return { id: doc.id, ...safe };
    });
    res.json(doctors);
  } catch (err) {
    console.error('Pending doctors error:', err);
    res.status(500).json({ error: 'Failed to fetch pending doctors' });
  }
});

app.post('/api/admin/approve-doctor/:userId', verifyAdmin, async (req, res) => {
  try {
    const ref = db.collection('users').doc(req.params.userId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().role !== 'doctor') {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    await ref.update({ status: 'active', approvedAt: new Date().toISOString() });
    res.json({ message: 'Doctor approved' });
  } catch (err) {
    console.error('Approve doctor error:', err);
    res.status(500).json({ error: 'Failed to approve doctor' });
  }
});

// ========================================
// 🗓️ Appointment routes
// ========================================
app.get('/api/appointments/check', verifyToken, async (req, res) => {
  try {
    const { date, time, doctorId } = req.query;
    if (!date || !time || !doctorId) {
      return res.status(400).json({ message: 'date, time, and doctorId are required' });
    }
    const snapshot = await db
      .collection('appointments')
      .where('date', '==', String(date))
      .where('time', '==', String(time))
      .where('doctorId', '==', String(doctorId))
      .limit(1)
      .get();
    res.status(200).json({ exists: !snapshot.empty });
  } catch (error) {
    console.error('Appointment check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/appointments', verifyToken, async (req, res) => {
  try {
    const { doctorId, date, time, notes } = req.body;
    const patientId = req.user.uid; // always from the verified token, never from the body

    if (!doctorId || !date || !time) {
      return res.status(400).json({ error: 'doctorId, date, and time are required' });
    }
    if (String(doctorId) === patientId) {
      return res.status(400).json({ error: 'You cannot book an appointment with yourself' });
    }

    // The doctor must exist and be approved
    const doctorDoc = await db.collection('users').doc(String(doctorId)).get();
    if (!doctorDoc.exists || doctorDoc.data().role !== 'doctor' || doctorDoc.data().status !== 'active') {
      return res.status(400).json({ error: 'Invalid doctor' });
    }

    const newAppointment = {
      doctorId: String(doctorId),
      patientId,
      date: String(date),
      time: String(time),
      notes: sanitizeInput(notes || '').slice(0, 2000),
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };

    // The slot is the document ID, so Firestore guarantees one booking per
    // doctor/date/time even if two requests arrive at the same moment.
    const slotId = `${doctorId}_${date}_${time}`.replace(/[\/\s:]/g, '-');
    const ref = db.collection('appointments').doc(slotId);

    try {
      await db.runTransaction(async (t) => {
        if ((await t.get(ref)).exists) throw new Error('SLOT_TAKEN');
        t.set(ref, newAppointment);
      });
    } catch (txError) {
      if (txError.message === 'SLOT_TAKEN') {
        return res.status(409).json({ error: 'This time slot is already booked' });
      }
      throw txError;
    }

    res.status(201).json({ message: 'Appointment booked', appointmentId: ref.id, data: newAppointment });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/appointments', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    const [asPatient, asDoctor] = await Promise.all([
      db.collection('appointments').where('patientId', '==', userId).get(),
      db.collection('appointments').where('doctorId', '==', userId).get(),
    ]);

    const seen = new Set();
    const appointments = [];
    for (const doc of [...asPatient.docs, ...asDoctor.docs]) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        appointments.push({ id: doc.id, ...doc.data() });
      }
    }

    appointments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.status(200).json(appointments);
  } catch (error) {
    console.error('GET appointments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================================
// 📊 Dashboard
// ========================================
app.get('/api/dashboard', verifyToken, async (req, res) => {
  try {
    // Sorted in memory. Combining where('patientId') with orderBy('date') needs a
    // composite Firestore index, and fails with an index error without one.
    const snapshot = await db.collection('appointments').where('patientId', '==', req.user.uid).get();
    const appointments = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const now = new Date();
    const next = appointments.find((a) => new Date(a.date) >= now) || null;
    res.status(200).json({ appointments, stats: { total: appointments.length, next } });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ========================================
// 📬 Contact form (public, so rate limited)
// ========================================
app.post('/api/contact', authLimiter, async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'name, email, and message are required' });
    }
    if (!isValidEmail(normalizeEmail(email))) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    await db.collection('contactMessages').add({
      name: sanitizeInput(name).slice(0, 200),
      email: normalizeEmail(email),
      phone: sanitizeInput(phone || '').slice(0, 50),
      subject: sanitizeInput(subject || 'General').slice(0, 200),
      message: sanitizeInput(message).slice(0, 5000),
      createdAt: new Date().toISOString(),
      read: false,
    });
    res.status(201).json({ message: 'Message received. We will get back to you shortly.' });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ========================================
// 404 + global error handler (must come after all routes)
// ========================================
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ error: 'Something went wrong' });
});

// Log crashes instead of dying silently
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));

// ========================================
// 🚀 Start
// ========================================
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Socket.io enabled`);
  console.log(`✅ Allowed origins: ${allowedOrigins.join(', ')}`);
});