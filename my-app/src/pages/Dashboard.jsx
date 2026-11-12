import { API_URL } from '../config';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Calendar, Video, MessageCircle, Clock, CheckCircle, XCircle,
  User, FileText, Settings, Search, Plus, Bell, Activity,
  TrendingUp, LogOut
} from 'lucide-react';

const DOCTOR_MAP = {
  doc1: 'Dr. Sarah Smith',
  doc2: 'Dr. Michael Johnson',
  doc3: 'Dr. Emily Lee',
  doc4: 'Dr. James Wilson',
};

const getDoctorName = (doctorId) => {
  if (!doctorId) return 'Unknown Doctor';
  return DOCTOR_MAP[doctorId] || doctorId;
};


export default function Dashboard() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const user = JSON.parse(localStorage.getItem('user'));
  const token = localStorage.getItem('authToken');

  const fetchAppointments = async () => {
    try {
      const authToken = localStorage.getItem('authToken');
      if (!authToken) {
        setError('Authentication token not found. Please login again.');
        setLoading(false);
        return;
      }
      const res = await axios.get(`${API_URL}/api/appointments`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setAppointments(res.data || []);
      setError(null);
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Session expired. Please login again.');
        localStorage.removeItem('user');
        localStorage.removeItem('authToken');
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setError(`Failed to load appointments: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAppointments(); }, []);

  const handleLogout = async () => {
    try {
      await axios.post(`${API_URL}/api/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
    finally {
      localStorage.removeItem('user');
      localStorage.removeItem('authToken');
      window.location.href = '/';
    }
  };

  const stats = {
    total: appointments.length,
    upcoming: appointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length,
    completed: appointments.filter(a => a.status === 'completed').length,
    thisWeek: appointments.filter(a => {
      const apptDate = new Date(a.date);
      const today = new Date();
      const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      return apptDate >= today && apptDate <= weekFromNow;
    }).length
  };

  const filteredAppointments = appointments.filter(appt => {
    const matchesSearch = searchQuery === '' ||
      appt.doctorId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      appt.notes?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || appt.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (status) => {
    const badges = {
      scheduled: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock, label: 'Scheduled' },
      completed: { color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle, label: 'Completed' },
      cancelled: { color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle, label: 'Cancelled' },
    };
    const badge = badges[status] || badges.scheduled;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${badge.color}`}>
        <Icon className="w-3 h-3" />{badge.label}
      </span>
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (!user || !token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Not Logged In</h1>
          <p className="text-gray-600 mb-6">Please log in to view your dashboard</p>
          <button onClick={() => navigate('/login')} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      {/* Top nav */}
      <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">TeleMed</h1>
              <p className="text-xs text-gray-500">Patient Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/notifications')} className="relative p-2 hover:bg-gray-100 rounded-full transition">
              <Bell className="w-5 h-5 text-gray-600" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-gray-800">{user?.name || 'Guest'}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            </div>
            <button onClick={handleLogout} className="p-2 hover:bg-red-50 rounded-full transition text-red-600" title="Logout">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            Welcome back, {user?.name?.split(' ')[0] || 'there'}! 👋
          </h2>
          <p className="text-gray-600">Here's what's happening with your health today</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[
            { label: 'Total Appointments', value: stats.total, icon: Calendar, color: 'indigo' },
            { label: 'Upcoming', value: stats.upcoming, icon: Clock, color: 'blue' },
            { label: 'Completed', value: stats.completed, icon: CheckCircle, color: 'green' },
            { label: 'This Week', value: stats.thisWeek, icon: Activity, color: 'purple' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`bg-white p-6 rounded-2xl shadow-md border border-${color}-100 hover:shadow-lg transition`}>
              <div className={`w-12 h-12 bg-${color}-100 rounded-xl flex items-center justify-center mb-4`}>
                <Icon className={`w-6 h-6 text-${color}-600`} />
              </div>
              <p className="text-gray-600 text-sm mb-1">{label}</p>
              <p className="text-3xl font-bold text-gray-800">{value}</p>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* ✅ Fixed: /appointmentform not /book-appointment */}
          <button
            onClick={() => navigate('/appointmentform')}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-xl shadow-md hover:shadow-xl transition flex items-center justify-center gap-3"
          >
            <Plus className="w-5 h-5" />
            <span className="font-semibold">Book Appointment</span>
          </button>
          <button
            onClick={() => navigate('/video-call')}
            className="bg-white text-gray-700 p-4 rounded-xl shadow-md hover:shadow-xl transition border border-gray-200 flex items-center justify-center gap-3"
          >
            <Video className="w-5 h-5 text-indigo-600" />
            <span className="font-semibold">Start Video Call</span>
          </button>
          {/* ✅ Fixed: scrolls down to appointments list instead of /chat with no ID */}
          <button
            onClick={() => document.getElementById('appointments-section')?.scrollIntoView({ behavior: 'smooth' })}
            className="bg-white text-gray-700 p-4 rounded-xl shadow-md hover:shadow-xl transition border border-gray-200 flex items-center justify-center gap-3"
          >
            <MessageCircle className="w-5 h-5 text-indigo-600" />
            <span className="font-semibold">Message Doctor</span>
          </button>
        </div>

        {/* Search & filter */}
        <div className="bg-white p-6 rounded-2xl shadow-md mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search appointments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              {['all', 'scheduled', 'completed'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-4 py-2 rounded-xl font-medium transition capitalize ${
                    filterStatus === status ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Appointments */}
        <div id="appointments-section">
          {loading && (
            <div className="text-center py-20">
              <div className="inline-block w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-600">Loading your appointments...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-center">
              <XCircle className="w-12 h-12 mx-auto mb-2 text-red-500" />
              <p className="font-semibold">{error}</p>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-800">
                  Your Appointments ({filteredAppointments.length})
                </h3>
              </div>

              {filteredAppointments.length === 0 ? (
                <div className="bg-white p-12 rounded-2xl shadow-md text-center">
                  <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Calendar className="w-12 h-12 text-indigo-600" />
                  </div>
                  <h4 className="text-xl font-semibold text-gray-800 mb-2">No appointments found</h4>
                  <p className="text-gray-600 mb-6">
                    {searchQuery || filterStatus !== 'all'
                      ? 'Try adjusting your search or filters'
                      : 'Get started by booking your first appointment'}
                  </p>
                  <button
                    onClick={() => navigate('/appointmentform')}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition inline-flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Book an Appointment
                  </button>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {filteredAppointments.map((appt) => (
                    <div key={appt.id} className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 hover:shadow-xl transition group">
                      <div className="flex items-start justify-between mb-4">
                        {getStatusBadge(appt.status || 'scheduled')}
                      </div>
                      <div className="space-y-3 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white">
                            <User className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Doctor</p>
                            <p className="font-semibold text-gray-800">{getDoctorName(appt.doctorId)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <Calendar className="w-4 h-4 text-indigo-600" />
                          <span className="font-medium">{formatDate(appt.date)}</span>
                          <span className="text-gray-400">•</span>
                          <Clock className="w-4 h-4 text-indigo-600" />
                          <span className="font-medium">{appt.time}</span>
                        </div>
                      </div>
                      {appt.notes && (
                        <div className="bg-gray-50 p-3 rounded-lg mb-4">
                          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                            <FileText className="w-3 h-3" /> Notes
                          </p>
                          <p className="text-sm text-gray-700">{appt.notes}</p>
                        </div>
                      )}
                      <div className="flex gap-2 pt-4 border-t border-gray-100">
                        <button
                          onClick={() => navigate(`/video-call/${appt.id}`)}
                          className="flex-1 bg-indigo-50 text-indigo-700 py-2 rounded-lg hover:bg-indigo-100 transition text-sm font-medium flex items-center justify-center gap-2"
                        >
                          <Video className="w-4 h-4" /> Join
                        </button>
                        {/* ✅ Fixed: uses appt.id (appointmentId) as the chat room */}
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
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}