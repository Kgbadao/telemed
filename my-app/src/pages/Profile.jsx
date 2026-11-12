import { API_URL } from '../config';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { User, Mail, Phone, FileText, Edit3, Save, X, Camera, CheckCircle } from 'lucide-react';


export default function Profile() {
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  // We read from localStorage first for instant display, then sync with backend
  useEffect(() => {
    const localUser = JSON.parse(localStorage.getItem('user') || 'null');
    const token = localStorage.getItem('authToken');

    if (localUser) {
      setUser({
        name: localUser.name || '',
        email: localUser.email || '',
        phone: localUser.phone || '',
        bio: localUser.bio || '',
        specialty: localUser.specialty || '',
      });
    }

    // Also try to fetch fresh data from backend
    if (token) {
      axios
        .get(`${API_URL}/api/user/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((res) => {
          setUser({
            name: res.data.name || localUser?.name || '',
            email: res.data.email || localUser?.email || '',
            phone: res.data.phone || '',
            bio: res.data.bio || '',
            specialty: res.data.specialty || '',
          });
        })
        .catch(() => {
          // Backend fetch failed — we already have localStorage data so this is fine
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const token = localStorage.getItem('authToken');

    try {
      await axios.put(`${API_URL}/api/user/me`, user, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Update localStorage so the Navbar name stays current
      const localUser = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...localUser, name: user.name, email: user.email }));

      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setError(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">You are not logged in.</p>
          <a href="/login" className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition">
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Success banner */}
        {saved && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 text-green-700">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium">Profile updated successfully!</span>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          {/* Header banner */}
          <div className="h-28 bg-gradient-to-r from-indigo-600 to-purple-600" />

          {/* Avatar + name row */}
          <div className="px-8 pb-6">
            <div className="flex items-end justify-between -mt-14 mb-6">
              {/* Avatar */}
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 border-4 border-white shadow-lg flex items-center justify-center text-white font-bold text-3xl">
                  {user.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                {editing && (
                  <button className="absolute bottom-0 right-0 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow hover:bg-indigo-700 transition" title="Change photo (coming soon)">
                    <Camera className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Edit / Save / Cancel buttons */}
              <div className="flex gap-2 mt-16">
                {editing ? (
                  <>
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition text-sm font-medium"
                    >
                      <X className="w-4 h-4" /> Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition text-sm font-semibold disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition text-sm font-semibold"
                  >
                    <Edit3 className="w-4 h-4" /> Edit Profile
                  </button>
                )}
              </div>
            </div>

            {/* Name display */}
            {!editing && (
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-800">{user.name || 'Your Name'}</h1>
                <p className="text-gray-500 text-sm mt-1">{user.email}</p>
                {user.specialty && (
                  <span className="inline-block mt-2 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
                    {user.specialty}
                  </span>
                )}
              </div>
            )}

            {/* Form fields */}
            <div className="space-y-5">
              {/* Full Name */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <User className="w-4 h-4 text-indigo-600" /> Full Name
                </label>
                {editing ? (
                  <input
                    type="text"
                    value={user.name}
                    onChange={(e) => setUser({ ...user, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    placeholder="Your full name"
                  />
                ) : (
                  <p className="px-4 py-3 bg-gray-50 rounded-xl text-gray-700">{user.name || '—'}</p>
                )}
              </div>

              {/* Email (always read-only — tied to auth) */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Mail className="w-4 h-4 text-indigo-600" /> Email Address
                </label>
                <p className="px-4 py-3 bg-gray-50 rounded-xl text-gray-500 text-sm">
                  {user.email || '—'}
                  <span className="ml-2 text-xs text-gray-400">(cannot be changed)</span>
                </p>
              </div>

              {/* Phone */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Phone className="w-4 h-4 text-indigo-600" /> Phone Number
                </label>
                {editing ? (
                  <input
                    type="tel"
                    value={user.phone}
                    onChange={(e) => setUser({ ...user, phone: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    placeholder="+1 (555) 000-0000"
                  />
                ) : (
                  <p className="px-4 py-3 bg-gray-50 rounded-xl text-gray-700">{user.phone || '—'}</p>
                )}
              </div>

              {/* Bio */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <FileText className="w-4 h-4 text-indigo-600" /> Bio
                </label>
                {editing ? (
                  <textarea
                    value={user.bio}
                    onChange={(e) => setUser({ ...user, bio: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none"
                    placeholder="Tell us a little about yourself..."
                  />
                ) : (
                  <p className="px-4 py-3 bg-gray-50 rounded-xl text-gray-700 min-h-[80px]">{user.bio || '—'}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}