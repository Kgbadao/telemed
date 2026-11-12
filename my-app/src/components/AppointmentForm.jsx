import { API_URL as API_BASE_URL } from '../config';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, Clock, User, CheckCircle, AlertCircle,
  Stethoscope, Activity, Search, ChevronRight, Star, Award, MapPin
} from 'lucide-react';

const timeSlots = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
];


const AppointmentForm = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formDoctorId, setFormDoctorId] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [bookedAppointmentId, setBookedAppointmentId] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [doctorsLoading, setDoctorsLoading] = useState(true);

  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const token = localStorage.getItem('authToken');

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/doctors`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDoctors(res.data);
      } catch (err) {
        console.error('Failed to fetch doctors:', err);
      } finally {
        setDoctorsLoading(false);
      }
    };
    fetchDoctors();
  }, []);

  const filteredDoctors = doctors.filter(doc =>
    doc.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.specialty?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDoctorSelect = (doctor) => {
    setFormDoctorId(doctor.id);
    setSelectedDoctor(doctor);
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formDate || !formTime || !formDoctorId) { setMessage('Please complete all steps'); return; }
    if (!token) { setMessage('Please log in to book an appointment'); return; }

    try {
      setLoading(true);
      setMessage('');

      const checkRes = await axios.get(`${API_BASE_URL}/api/appointments/check`, {
        params:  { date: formDate, time: formTime, doctorId: formDoctorId },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (checkRes.data.exists) {
        setMessage('This time slot is already booked. Please choose another.');
        setLoading(false);
        return;
      }

      const res = await axios.post(
        `${API_BASE_URL}/api/appointments`,
        { date: formDate, time: formTime, doctorId: formDoctorId, notes },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setBookedAppointmentId(res.data.appointmentId);
      setMessage('success');
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || 'Error creating appointment');
    } finally {
      setLoading(false);
    }
  };

  const getMinDate = () => new Date().toISOString().split('T')[0];

  if (message === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-12 text-center max-w-md">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-4">Appointment Confirmed!</h2>
          <p className="text-gray-600 mb-6">
            Your appointment with <strong>{selectedDoctor?.name}</strong> has been successfully booked.
          </p>
          <div className="bg-indigo-50 p-4 rounded-xl mb-8">
            <div className="flex items-center justify-center gap-2 text-indigo-700 mb-2">
              <Calendar className="w-5 h-5" />
              <span className="font-semibold">
                {new Date(formDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
            </div>
            <div className="flex items-center justify-center gap-2 text-indigo-700">
              <Clock className="w-5 h-5" />
              <span className="font-semibold">{formTime}</span>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {bookedAppointmentId && (
              <button
                onClick={() => navigate(`/chat/${bookedAppointmentId}`)}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-semibold hover:shadow-lg transition"
              >
                Open Chat with Doctor
              </button>
            )}
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-4">Book Your Appointment</h1>
          <p className="text-xl text-gray-600">Connect with top healthcare professionals in minutes</p>
        </div>

        {/* Steps */}
        <div className="flex items-center justify-center mb-12">
          <div className="flex items-center gap-4">
            {[{ n: 1, label: 'Choose Doctor' }, { n: 2, label: 'Select Time' }, { n: 3, label: 'Confirm' }].map(({ n, label }, i, arr) => (
              <React.Fragment key={n}>
                <div className={`flex items-center gap-3 ${step >= n ? 'opacity-100' : 'opacity-40'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${step >= n ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                    {n}
                  </div>
                  <span className="hidden sm:block font-medium text-gray-700">{label}</span>
                </div>
                {i < arr.length - 1 && <ChevronRight className="w-5 h-5 text-gray-400" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step 1 — Choose Doctor */}
        {step === 1 && (
          <div>
            <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
              <div className="relative">
                <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name or specialty..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {doctorsLoading && (
              <div className="text-center py-20">
                <div className="inline-block w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-gray-600">Loading doctors...</p>
              </div>
            )}

            {!doctorsLoading && filteredDoctors.length === 0 && (
              <div className="bg-white rounded-2xl shadow p-12 text-center">
                <Stethoscope className="w-16 h-16 text-indigo-200 mx-auto mb-4" />
                <h4 className="text-xl font-semibold text-gray-700 mb-2">No doctors available</h4>
                <p className="text-gray-500">Please check back soon — doctors are being verified and approved.</p>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              {filteredDoctors.map((doctor) => (
                <button
                  key={doctor.id}
                  onClick={() => handleDoctorSelect(doctor)}
                  className="bg-white rounded-2xl shadow-md hover:shadow-xl transition p-6 text-left group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-400 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                      {doctor.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-800 mb-1 group-hover:text-indigo-600 transition">
                        {doctor.name}
                      </h3>
                      <div className="flex items-center gap-2 text-gray-600 mb-3">
                        <Stethoscope className="w-4 h-4" />
                        <span className="text-sm">{doctor.specialty}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        {doctor.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            <span className="font-semibold text-gray-700">{doctor.rating}</span>
                          </div>
                        )}
                        {doctor.experience && (
                          <div className="flex items-center gap-1">
                            <Award className="w-4 h-4" />
                            <span>{doctor.experience}</span>
                          </div>
                        )}
                        {doctor.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            <span>{doctor.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-6 h-6 text-gray-400 group-hover:text-indigo-600 transition flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Select Time */}
        {step === 2 && selectedDoctor && (
          <div>
            <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold">
                    {selectedDoctor.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{selectedDoctor.name}</h3>
                    <p className="text-sm text-gray-600">{selectedDoctor.specialty}</p>
                  </div>
                </div>
                <button onClick={() => setStep(1)} className="text-indigo-600 hover:text-indigo-700 font-medium text-sm">
                  Change Doctor
                </button>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                    <Calendar className="w-5 h-5 text-indigo-600" /> Select Date
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    min={getMinDate()}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                    <Clock className="w-5 h-5 text-indigo-600" /> Select Time
                  </label>
                  <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                    {timeSlots.map((time) => (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setFormTime(time)}
                        className={`py-2 px-3 rounded-lg border-2 transition font-medium text-sm ${
                          formTime === time
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                            : 'border-gray-200 hover:border-indigo-300 text-gray-700'
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Additional Notes (Optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe your symptoms..."
                  rows="3"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={() => formDate && formTime && setStep(3)}
                disabled={!formDate || !formTime}
                className="w-full mt-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue to Review
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Confirm */}
        {step === 3 && selectedDoctor && (
          <div>
            <div className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl mx-auto">
              <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Review Your Appointment</h2>
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-4 p-4 bg-indigo-50 rounded-xl">
                  <User className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Healthcare Provider</p>
                    <p className="font-semibold text-gray-800">{selectedDoctor.name}</p>
                    <p className="text-sm text-gray-600">{selectedDoctor.specialty}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-purple-50 rounded-xl">
                  <Calendar className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Date</p>
                    <p className="font-semibold text-gray-800">
                      {new Date(formDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-pink-50 rounded-xl">
                  <Clock className="w-6 h-6 text-pink-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Time</p>
                    <p className="font-semibold text-gray-800">{formTime}</p>
                  </div>
                </div>
                {notes && (
                  <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
                    <Activity className="w-6 h-6 text-gray-600 flex-shrink-0 mt-1" />
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Notes</p>
                      <p className="text-gray-800">{notes}</p>
                    </div>
                  </div>
                )}
              </div>

              {message && message !== 'success' && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-red-700 text-sm">{message}</p>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-gray-100 text-gray-700 py-4 rounded-xl font-semibold hover:bg-gray-200 transition"
                >
                  Go Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50"
                >
                  {loading ? 'Booking...' : 'Confirm Appointment'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AppointmentForm;