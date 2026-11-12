import { API_URL } from '../config';
import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import axios from 'axios';


export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await axios.post(`${API_URL}/api/auth/register`, form);
      alert('Registered successfully. Please login.');
      window.location.href = '/login';
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = (credentialResponse) => {
    if (!credentialResponse?.credential) {
      setError('Google credential missing');
      return;
    }

    fetch(`${API_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token: credentialResponse.credential }),
    })
      .then((res) =>
        res.ok
          ? (window.location.href = '/dashboard')
          : setError('Google registration failed')
      )
      .catch(() => setError('Network error during Google registration'));
  };

  const handleGoogleFailure = () => {
    setError('Google registration was cancelled or failed');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-indigo-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white/60 backdrop-blur-md border border-white/20 shadow-xl rounded-2xl p-8">
        <h2 className="text-3xl font-bold text-center text-indigo-700 mb-6">Register for TeleMed</h2>

        {/* Manual Registration */}
        <form className="space-y-4" onSubmit={handleFormSubmit}>
          <input
            type="text"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white py-3 rounded-xl hover:bg-indigo-700 transition shadow-md"
            disabled={loading}
          >
            {loading ? 'Registering...' : 'Register'}
          </button>
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center justify-center gap-2 text-sm text-gray-500">
          <div className="h-px w-full bg-gray-300" /> or <div className="h-px w-full bg-gray-300" />
        </div>

        {/* Google Registration */}
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleFailure}
            useOneTap
          />
        </div>
      </div>
    </div>
  );
}