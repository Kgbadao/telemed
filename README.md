# TeleMed — Telemedicine Web Platform

A full-stack telemedicine platform that connects patients with doctors through appointment booking, real-time chat and peer-to-peer video consultations. Built solo, end to end: frontend, API, real-time layer and deployment.

**Live demo:** https://my-react-app-n8v7.vercel.app/ · Doctor and patient data in the demo are seeded.

<!--
Add 3 screenshots, then delete this comment:
1. Save them in a folder called docs/ (dashboard.png, booking.png, video-call.png)
2. Uncomment the lines below

![Patient dashboard](docs/dashboard.png)
![Booking flow](docs/booking.png)
![Video consultation](docs/video-call.png)
-->

## Features

- **Patient dashboard** — upcoming and completed appointments with quick actions
- **Doctor discovery** — browse approved doctors by specialty
- **Booking flow** — choose a doctor, pick a date and time, confirm; slots can't be double-booked
- **Real-time chat** — per-appointment rooms over Socket.io, with file sharing and message search
- **Video consultations** — peer-to-peer calls using WebRTC (PeerJS)
- **Doctor onboarding** — doctors register with a license; an admin approves them before they appear in search
- **Auth** — email + password, or Google sign-in

## Architecture

```
React + Vite (Vercel)
      │  REST (JWT) + Socket.io
      ▼
Express API (Render) ──► Firestore + Cloud Storage (via Firebase Admin SDK)
      │
      └─ Socket.io rooms (chat)        PeerJS / WebRTC (video, peer to peer)
```

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Axios |
| Backend | Node.js, Express 5, Socket.io |
| Data | Firestore, Cloud Storage (accessed only through the backend) |
| Auth | bcrypt-hashed passwords + signed JWTs; Google ID-token verification |
| Real-time | Socket.io (chat), PeerJS/WebRTC (video) |
| Hosting | Vercel (frontend), Render (backend) |

Authentication is custom (bcrypt + JWT, users stored in Firestore). Firebase Authentication is **not** used for login; the Google client library is only used to verify Google ID tokens.

## Design decisions

- **No paid third-party services.** Video uses WebRTC directly instead of a hosted provider like Twilio or Agora, so the project has no per-minute costs.
- **All data access goes through the backend.** Firestore rules deny every direct client read and write, so security rules are enforced in one place: the API.
- **Rooms are access-controlled.** Early versions used public room IDs. Chat and video rooms now check that the user is the patient or the doctor on that appointment.

Want the story behind the video feature? I wrote it up here: [Demystifying WebRTC: A Step By Step Guide to Peer-to-Peer Video in React](https://dev.to/kgbadao/demystifying-webrtc-a-step-by-step-guide-to-peer-to-peer-video-in-react-4k3b).

## Running locally

Requires Node 18+ and a Firebase project (Firestore + Storage enabled).

```bash
git clone https://github.com/Kgbadao/telemed
cd telemed
```

**Backend**
```bash
cd my-app/backend
cp .env.example .env      # fill in the values (see comments inside)
npm install
npm start                 # http://localhost:5000
```

**Frontend** (in a second terminal)
```bash
cd my-app
cp .env.example .env      # VITE_API_URL=http://localhost:5000
npm install
npm run dev               # http://localhost:5173
```

**Creating an admin:** register a normal account, then in the Firebase console set `role` to `admin` on that user's document in the `users` collection and log in again. Admins can approve doctors at `/admin/approvals`.

**Firestore rules:** the backend uses the Admin SDK, so clients never touch Firestore directly. Deploy [`my-app/firestore.rules`](./my-app/firestore.rules) (deny all) to lock it down.

## Security measures

- Passwords hashed with bcrypt (12 rounds); stored hashes are stripped from API responses
- JWT auth on API routes and on the Socket.io handshake; chat and video rooms check that the user is the patient or doctor on that appointment
- Admin endpoints require a JWT with the `admin` role
- Appointment slots are claimed in a Firestore transaction, so two simultaneous requests can't book the same slot; the doctor must exist and be approved
- Rate limiting (100 requests/min on the API, 20 per 15 min on auth routes), `helmet` headers, CORS allow-list, input sanitising (`xss`), upload size and type limits
- Secrets live only in environment variables; `.env` files and service-account JSON are git-ignored

## Known limitations and next steps

- The JWT is kept in `localStorage`, which is exposed to XSS. Moving it to an `httpOnly` cookie is the next hardening step
- No automated tests yet — the booking and auth routes are the first candidates
- Passwords only require 6 characters, and the email-uniqueness check on signup is not transactional
- Planned features: appointment expiry, in-app doctor referrals, follow-up scheduling
- Not built yet: payments and prescription management
