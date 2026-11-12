import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { OAuth2Client } from 'google-auth-library';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import xss from 'xss';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import path from 'path';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 5000;

// JWT_SECRET must be in your .env file — a long random string.
// Generate one by running this in your terminal:
//   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
// Then add it to Render as an environment variable: JWT_SECRET=<that value>
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET is not set in environment variables');
  process.exit(1);
}

// ========================================
// CORS
// ========================================
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS policy: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.options(/.*/, cors());

// ========================================
// HTTP Server & Socket.io
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
// Firebase Admin (Firestore + Storage + Google token verification)
// ========================================
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
  credential: cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const db     = getFirestore();
const bucket = getStorage().bucket();
const auth   = getAuth(); // still used to verify Google ID tokens

// ========================================
// General Middleware
// ========================================
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());

// 100 requests per minute per IP on all /api/ routes
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Stricter limit on auth endpoints — 20 per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ========================================
// File Upload
// ========================================
const multerStorage = multer.memoryStorage();
const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Invalid file type'));
  },
});

// ========================================
// Helpers
// ========================================
const sanitizeInput = (text) =>
  xss(text, { whiteList: {}, stripIgnoreTag: true });

// Creates a signed JWT that expires in 7 days.
// This is what the frontend stores in localStorage and sends as Bearer token.
const signToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

// Verifies the JWT signature. Puts decoded data in req.user.
// req.user will have: { uid, email, name, role, iat, exp }
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expired, please login again' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Checks the requesting user is the patient or doctor on an appointment.
// roomId in this app equals appointmentId.
const verifyRoomMembership = async (userId, roomId) => {
  const apptDoc = await db.collection('appointments').doc(roomId).get();
  if (!apptDoc.exists) return false;
  const appt = apptDoc.data();
  return appt.patientId === userId || appt.doctorId === userId;
};

// ========================================
// Socket.io Auth — uses the same JWT
// ========================================
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Auth error: No token provided'));

    const decoded    = jwt.verify(token, JWT_SECRET);
    socket.userId    = decoded.uid;
    socket.userEmail = decoded.email || '';
    socket.userName  = decoded.name  || decoded.email || 'Anonymous';
    next();
  } catch {
    next(new Error('Auth error: Invalid or expired token'));
  }
});

// ========================================
// Socket.io — Real-time Chat
// ========================================
const activeUsers = new Map();
const typingUsers  = new Map();

io.on('connection', (socket) => {
  console.log(`✅ Socket connected: ${socket.userId} (${socket.id})`);

  activeUsers.set(socket.userId, {
    socketId:  socket.id,
    userId:    socket.userId,
    userName:  socket.userName,
    userEmail: socket.userEmail,
    lastSeen:  new Date(),
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
        userId: socket.userId, userName: socket.userName, timestamp: new Date(),
      });

      const roomUsers = Array.from(activeUsers.values()).filter((u) =>
        io.sockets.adapter.rooms.get(roomId)?.has(u.socketId)
      );
      socket.emit('room-users', roomUsers);
    } catch (err) {
      console.error('join-room error:', err);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('send-message', async (data) => {
    try {
      const { roomId, text, replyTo } = data;
      if (!roomId || !text) {
        socket.emit('error', { message: 'roomId and text are required' });
        return;
      }

      const sanitizedText = sanitizeInput(text);
      if (!sanitizedText || sanitizedText.length > 5000) {
        socket.emit('error', { message: 'Invalid message length (max 5000 chars)' });
        return;
      }

      if (!socket.rooms.has(roomId)) {
        socket.emit('error', { message: 'Not a member of this room' });
        return;
      }

      const message = {
        id:          `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        roomId,
        senderId:    socket.userId,
        senderName:  socket.userName,
        text:        sanitizedText,
        replyTo:     replyTo || null,
        createdAt:   new Date().toISOString(),
        updatedAt:   null,
        deleted:     false,
        edited:      false,
        reactions:   {},
        readBy:      [socket.userId],
        deliveredTo: [socket.userId],
        status:      'delivered',
      };

      await db.collection('chatRooms').doc(roomId).collection('messages').doc(message.id).set(message);
      io.to(roomId).emit('new-message', message);
      socket.emit('message-delivered', { messageId: message.id });
      typingUsers.delete(socket.userId);
      io.to(roomId).emit('user-stop-typing', { userId: socket.userId });
    } catch (error) {
      console.error('send-message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('typing', (roomId) => {
    typingUsers.set(socket.userId, { roomId, userName: socket.userName });
    socket.to(roomId).emit('user-typing', { userId: socket.userId, userName: socket.userName });
  });

  socket.on('stop-typing', (roomId) => {
    typingUsers.delete(socket.userId);
    socket.to(roomId).emit('user-stop-typing', { userId: socket.userId });
  });

  socket.on('mark-read', async ({ roomId, messageId }) => {
    try {
      const messageRef = db.collection('chatRooms').doc(roomId).collection('messages').doc(messageId);
      await messageRef.update({ readBy: FieldValue.arrayUnion(socket.userId) });
      io.to(roomId).emit('message-read', { messageId, userId: socket.userId });
    } catch (error) {
      console.error('mark-read error:', error);
    }
  });

  socket.on('edit-message', async ({ roomId, messageId, newText }) => {
    try {
      const sanitizedText = sanitizeInput(newText);
      if (!sanitizedText || sanitizedText.length > 5000) {
        socket.emit('error', { message: 'Invalid message text' }); return;
      }
      const messageRef = db.collection('chatRooms').doc(roomId).collection('messages').doc(messageId);
      const messageDoc = await messageRef.get();
      if (!messageDoc.exists || messageDoc.data().senderId !== socket.userId) {
        socket.emit('error', { message: 'Unauthorized' }); return;
      }
      await messageRef.update({ text: sanitizedText, edited: true, updatedAt: new Date().toISOString() });
      io.to(roomId).emit('message-edited', { messageId, newText: sanitizedText, edited: true });
    } catch {
      socket.emit('error', { message: 'Failed to edit message' });
    }
  });

  socket.on('delete-message', async ({ roomId, messageId }) => {
    try {
      const messageRef = db.collection('chatRooms').doc(roomId).collection('messages').doc(messageId);
      const messageDoc = await messageRef.get();
      if (!messageDoc.exists || messageDoc.data().senderId !== socket.userId) {
        socket.emit('error', { message: 'Unauthorized' }); return;
      }
      await messageRef.update({ deleted: true, text: '[Message deleted]', updatedAt: new Date().toISOString() });
      io.to(roomId).emit('message-deleted', { messageId });
    } catch {
      socket.emit('error', { message: 'Failed to delete message' });
    }
  });

  socket.on('add-reaction', async ({ roomId, messageId, emoji }) => {
    try {
      if (!emoji || emoji.length > 10) {
        socket.emit('error', { message: 'Invalid emoji' }); return;
      }
      const messageRef = db.collection('chatRooms').doc(roomId).collection('messages').doc(messageId);
      await messageRef.update({ [`reactions.${emoji}`]: FieldValue.arrayUnion(socket.userId) });
      io.to(roomId).emit('reaction-added', { messageId, emoji, userId: socket.userId });
    } catch (error) {
      console.error('add-reaction error:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected: ${socket.userId}`);
    if (socket.currentRoom) {
      io.to(socket.currentRoom).emit('user-left', {
        userId: socket.userId, userName: socket.userName, timestamp: new Date(),
      });
    }
    activeUsers.delete(socket.userId);
    typingUsers.delete(socket.userId);
  });
});

// ========================================
// 🔐 AUTH ROUTES
// ========================================

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role = 'patient',
      specialization,
      licenseNumber,
      licenseURL,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (!['patient', 'doctor'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (role === 'doctor') {
      if (!specialization || !licenseNumber || !licenseURL) {
        return res.status(400).json({
          message: 'specialization, licenseNumber, and licenseURL are required for doctors',
        });
      }
    }

    const existing = await db.collection('users').where('email', '==', email).get();
    if (!existing.empty) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = {
      name:      sanitizeInput(name),
      email,
      password:  hashedPassword,
      provider:  'email',
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
      userId:  docRef.id,
      token,
      name:    newUser.name,
      email,
      role,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const snapshot = await db.collection('users').where('email', '==', email).get();
    if (snapshot.empty) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const userDoc  = snapshot.docs[0];
    const userData = userDoc.data();

    const passwordMatch = await bcrypt.compare(password, userData.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = signToken({
      uid:   userDoc.id,
      email: userData.email,
      name:  userData.name,
      role:  userData.role || 'patient',
    });

    res.status(200).json({
      message: 'Login successful',
      userId:  userDoc.id,
      name:    userData.name,
      email:   userData.email,
      role:    userData.role || 'patient',
      status:  userData.status || 'active',
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Google OAuth — now correctly at /api/auth/google (was missing the /api prefix)
app.post('/api/auth/google', authLimiter, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Missing token' });

    const ticket  = await googleClient.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', email).get();

    let userId, role;
    if (snapshot.empty) {
      const docRef = await usersRef.add({
        name, email, picture: picture || null,
        provider: 'google', role: 'patient',
        createdAt: new Date().toISOString(),
      });
      userId = docRef.id;
      role   = 'patient';
    } else {
      userId = snapshot.docs[0].id;
      role   = snapshot.docs[0].data().role || 'patient';
    }

    const jwtToken = signToken({ uid: userId, email, name, role });
    const userStatus = snapshot.empty ? 'active' : (snapshot.docs[0].data().status || 'active');
    res.status(200).json({ message: 'Google user authenticated', name, email, userId, role, token: jwtToken });
  } catch (err) {
    console.error('Google Auth error:', err);
    res.status(401).json({ message: 'Invalid Google token' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.status(200).json({ message: 'Logged out successfully' });
});

// ========================================
// 👤 USER ROUTES
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
    if (name  !== undefined) updates.name  = sanitizeInput(name);
    if (phone !== undefined) updates.phone = sanitizeInput(phone);
    if (bio   !== undefined) updates.bio   = sanitizeInput(bio);

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
// 💬 CHAT ROUTES
// ========================================

app.get('/api/chat/:roomId/messages', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const isMember = await verifyRoomMembership(req.user.uid, roomId);
    if (!isMember) return res.status(403).json({ error: 'Access denied to this chat room' });

    const limit         = Math.min(parseInt(req.query.limit) || 50, 100);
    const lastMessageId = req.query.lastMessageId;

    const messagesRef = db.collection('chatRooms').doc(roomId).collection('messages');
    let query = messagesRef.orderBy('createdAt', 'desc').limit(limit);

    if (lastMessageId) {
      const lastDoc = await messagesRef.doc(lastMessageId).get();
      if (lastDoc.exists) query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    const messages  = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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

    const isMember = await verifyRoomMembership(req.user.uid, roomId);
    if (!isMember) return res.status(403).json({ error: 'Access denied to this chat room' });

    const safeFileName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const file = bucket.file(`chat-files/${roomId}/${Date.now()}_${safeFileName}`);

    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
        metadata: { uploadedBy: req.user.uid, originalName: req.file.originalname },
      },
    });

    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });

    const message = {
      id:        `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      roomId,
      senderId:  req.user.uid,
      senderName: req.user.name || req.user.email,
      type: 'file', fileUrl: url,
      fileName:  req.file.originalname,
      fileType:  req.file.mimetype,
      fileSize:  req.file.size,
      createdAt: new Date().toISOString(),
      deleted:   false,
      readBy:    [req.user.uid],
    };

    await db.collection('chatRooms').doc(roomId).collection('messages').doc(message.id).set(message);
    res.json({ success: true, url, message });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/chat/:roomId/search', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { query }  = req.query;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const isMember = await verifyRoomMembership(req.user.uid, roomId);
    if (!isMember) return res.status(403).json({ error: 'Access denied to this chat room' });

    const snapshot = await db
      .collection('chatRooms').doc(roomId).collection('messages')
      .where('deleted', '==', false).get();

    const messages = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((msg) => msg.text?.toLowerCase().includes(query.toLowerCase()));

    res.json({ messages });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ========================================
// DOCTOR ROUTES
// ========================================

// Returns active doctors with real Firestore UIDs - fixes doc1/doc2 hardcoded IDs.
app.get('/api/doctors', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('users')
      .where('role', '==', 'doctor')
      .where('status', '==', 'active')
      .get();
    const doctors = snapshot.docs.map((doc) => {
      const { password: _pw, licenseURL: _l, ...safe } = doc.data();
      return {
        id:         doc.id,
        name:       safe.name           || 'Unknown',
        specialty:  safe.specialization || 'General Practice',
        experience: safe.experience     || '',
        location:   safe.location       || '',
        rating:     safe.rating         || null,
        picture:    safe.picture        || null,
      };
    });
    res.status(200).json(doctors);
  } catch (error) {
    console.error('GET /api/doctors error:', error);
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

// POST /api/doctor/register  (multipart/form-data)
// Uploads license via Admin SDK so Firebase Storage rules are bypassed entirely.
// Uses getSignedUrl (v4) NOT makePublic - makePublic fails when uniform bucket-level
// access is enabled. V4 read URLs must expire within 7 days.
app.post('/api/doctor/register', authLimiter, (req, res, next) => {
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
}, async (req, res) => {
  try {
    const { name, email, password, specialization, licenseNumber } = req.body;

    if (!name || !email || !password || !specialization || !licenseNumber) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Medical license file is required' });
    }

    const existing = await db.collection('users').where('email', '==', email).get();
    if (!existing.empty) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    // Upload via Admin SDK - no Storage rules apply
    const safeFileName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `licenses/${Date.now()}_${safeFileName}`;
    const fileRef = bucket.file(filePath);

    await fileRef.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
        metadata: { uploadedBy: email },
      },
    });

    // V4 signed URLs may not expire more than 7 days in the future (604800s).
    // A 365-day expiry throws from the signer and surfaced as 500 — match chat upload.
    const licenseUrlTtlMs = 7 * 24 * 60 * 60 * 1000;
    const [licenseURL] = await fileRef.getSignedUrl({
      version: 'v4',
      action:  'read',
      expires: Date.now() + licenseUrlTtlMs,
    });

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = {
      name:           sanitizeInput(name),
      email,
      password:       hashedPassword,
      provider:       'email',
      role:           'doctor',
      specialization: sanitizeInput(specialization),
      licenseNumber:  sanitizeInput(licenseNumber),
      licenseURL,
      status:         'pending',
      createdAt:      new Date().toISOString(),
    };

    const docRef = await db.collection('users').add(newUser);
    const token = signToken({ uid: docRef.id, email, name: newUser.name, role: 'doctor' });

    res.status(201).json({
      message: 'Registration submitted. Your credentials are under review.',
      userId:  docRef.id,
      token,
      name:    newUser.name,
      email,
      role:    'doctor',
      status:  'pending',
    });
  } catch (error) {
    console.error('Doctor registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Admin middleware — requires a valid JWT whose role is 'admin'.
// To make an admin: in the Firebase console, set role = "admin" on that user's
// document in the `users` collection, then log in again to get a fresh token.
const verifyAdmin = [
  verifyToken,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  },
];

// GET pending doctors
app.get('/api/admin/pending-doctors', verifyAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('users')
      .where('role', '==', 'doctor')
      .where('status', '==', 'pending')
      .get();
    const doctors = snapshot.docs.map(doc => {
      const { password: _pw, ...safe } = doc.data();
      return { id: doc.id, ...safe };
    });
    res.json(doctors);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending doctors' });
  }
});

// POST approve doctor
app.post('/api/admin/approve-doctor/:userId', verifyAdmin, async (req, res) => {
  try {
    await db.collection('users').doc(req.params.userId).update({ status: 'active' });
    res.json({ message: 'Doctor approved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve doctor' });
  }
});

// ========================================
// 🗓️ APPOINTMENT ROUTES
// ========================================

app.get('/api/appointments/check', verifyToken, async (req, res) => {
  try {
    const { date, time, doctorId } = req.query;
    if (!date || !time || !doctorId) {
      return res.status(400).json({ message: 'date, time, and doctorId are required' });
    }
    const snapshot = await db.collection('appointments')
      .where('date', '==', date).where('time', '==', time).where('doctorId', '==', doctorId).get();
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

    // The doctor must exist and be an approved doctor
    const doctorDoc = await db.collection('users').doc(String(doctorId)).get();
    if (!doctorDoc.exists || doctorDoc.data().role !== 'doctor' || doctorDoc.data().status !== 'active') {
      return res.status(400).json({ error: 'Invalid doctor' });
    }

    const newAppointment = {
      doctorId, patientId, date, time,
      notes:     sanitizeInput(notes || ''),
      status:    'scheduled',
      createdAt: new Date().toISOString(),
    };

    // The slot itself is the document ID, so Firestore guarantees only one booking
    // per doctor/date/time even if two requests arrive at the same moment.
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
      db.collection('appointments').where('doctorId',  '==', userId).get(),
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
// 📊 DASHBOARD ROUTE
// ========================================
app.get('/api/dashboard', verifyToken, async (req, res) => {
  try {
    const userId  = req.user.uid;
    const snapshot = await db.collection('appointments').where('patientId', '==', userId).orderBy('date').get();
    const appointments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const next = appointments.find((a) => new Date(a.date) >= new Date()) || null;
    res.status(200).json({ appointments, stats: { total: appointments.length, next } });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ========================================
// 📬 CONTACT ROUTE
// ========================================
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'name, email, and message are required' });
    }
    await db.collection('contactMessages').add({
      name: sanitizeInput(name), email, phone: phone || '',
      subject: subject || 'General', message: sanitizeInput(message),
      createdAt: new Date().toISOString(), read: false,
    });
    res.status(201).json({ message: 'Message received. We will get back to you shortly.' });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ========================================
// 🚀 Start Server
// ========================================
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Socket.io enabled`);
  console.log(`✅ Allowed origins: ${allowedOrigins.join(', ')}`);
});