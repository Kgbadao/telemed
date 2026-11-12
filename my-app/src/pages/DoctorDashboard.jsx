import { API_URL } from '../config';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Calendar, Video, MessageCircle, Clock,
  CheckCircle, User, Activity, LogOut, Bell
} from 'lucide-react';


export default function DoctorDashboard() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('authToken');

  useEffect(() => {
    // Redirect pending doctors away
    if (user.status === 'pending') { navigate('/pending'); return; }
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/appointments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAppointments(res.data || []);
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.clear();
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    navigate('/');
  };

  const stats = {
    total:     appointments.length,
    today:     appointments.filter(a => new Date(a.date).toDateString() === new Date().toDateString()).length,
    upcoming:  appointments.filter(a => new Date(a.date) > new Date() && a.status !== 'cancelled').length,
    completed: appointments.filter(a => a.status === 'completed').length,
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">

      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">TeleMed</h1>
              <p className="text-xs text-gray-500">Doctor Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 hover:bg-gray-100 rounded-full transition">
              <Bell className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-gray-800">{user.name}</p>
                <p className="text-xs text-indigo-600 font-medium">Doctor</p>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-teal-500 rounded-full flex items-center justify-center text-white font-semibold">
                {user.name?.charAt(0).toUpperCase() || 'D'}
              </div>
            </div>
            <button onClick={handleLogout} className="p-2 hover:bg-red-50 rounded-full transition text-red-600">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            Good day, {user.name?.split(' ')[0] || 'Doctor'} 👋
          </h2>
          <p className="text-gray-600">Here are your patient appointments</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[
            { label: 'Total Patients', value: stats.total, icon: User, color: 'indigo' },
            { label: 'Today', value: stats.today, icon: Clock, color: 'blue' },
            { label: 'Upcoming', value: stats.upcoming, icon: Calendar, color: 'purple' },
            { label: 'Completed', value: stats.completed, icon: CheckCircle, color: 'green' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`bg-white p-6 rounded-2xl shadow-md border border-${color}-100`}>
              <div className={`w-12 h-12 bg-${color}-100 rounded-xl flex items-center justify-center mb-4`}>
                <Icon className={`w-6 h-6 text-${color}-600`} />
              </div>
              <p className="text-gray-600 text-sm mb-1">{label}</p>
              <p className="text-3xl font-bold text-gray-800">{value}</p>
            </div>
          ))}
        </div>

        {/* Appointments */}
        <h3 className="text-2xl font-bold text-gray-800 mb-6">
          Patient Appointments ({appointments.length})
        </h3>

        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-600">Loading appointments...</p>
          </div>
        )}

        {!loading && appointments.length === 0 && (
          <div className="bg-white p-12 rounded-2xl shadow-md text-center">
            <Calendar className="w-16 h-16 text-indigo-300 mx-auto mb-4" />
            <h4 className="text-xl font-semibold text-gray-800 mb-2">No appointments yet</h4>
            <p className="text-gray-500">Patient appointments will appear here once booked.</p>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {appointments.map((appt) => (
            <div key={appt.id} className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 hover:shadow-xl transition">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Patient</p>
                  <p className="font-semibold text-gray-800">{appt.patientName || appt.patientId}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-600 mb-4">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span className="font-medium">{formatDate(appt.date)}</span>
                <span className="text-gray-400">•</span>
                <Clock className="w-4 h-4 text-indigo-600" />
                <span className="font-medium">{appt.time}</span>
              </div>
              {appt.notes && (
                <div className="bg-gray-50 p-3 rounded-lg mb-4 text-sm text-gray-600">
                  {appt.notes}
                </div>
              )}
              <div className="flex gap-2 pt-4 border-t border-gray-100">
                <button
                  onClick={() => navigate(`/video-call/${appt.id}`)}
                  className="flex-1 bg-indigo-50 text-indigo-700 py-2 rounded-lg hover:bg-indigo-100 transition text-sm font-medium flex items-center justify-center gap-2"
                >
                  <Video className="w-4 h-4" /> Join Call
                </button>
                <button
                  onClick={() => navigate(`/chat/${appt.id}`)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 transition text-sm font-medium flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" /> Chat
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}