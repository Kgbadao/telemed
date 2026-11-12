// Single source of truth for the backend URL.
// Set VITE_API_URL in a .env file (local) or in your Vercel project settings (production).
export const API_URL = import.meta.env.VITE_API_URL || 'https://telemed-seel.onrender.com';
