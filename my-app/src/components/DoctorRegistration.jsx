import { API_URL } from '../config';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// NOTE: All Firebase Storage imports removed.
// License file is sent to POST /api/doctor/register as multipart/form-data.
// Server uploads it via Admin SDK — bypasses Firebase Storage rules entirely.
// This fixes the "storage/unauthorized" error caused by JWT users not being
// signed into Firebase client auth.


const SPECIALIZATIONS = [
  'General Practice', 'Cardiology', 'Pediatrics', 'Mental Health',
  'Dermatology', 'Orthopedics', 'Gynecology', 'Neurology', 'Family Medicine', 'Other',
];

const DoctorRegistration = () => {
  const [formData, setFormData] = useState({
    name: '', email: '', password: '', specialization: '', licenseNumber: '',
  });
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowed.includes(selected.type)) {
      setError('Only PDF, JPG, or PNG files are accepted.'); return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError('File must be under 10MB.'); return;
    }
    setError('');
    setFile(selected);
    setFileName(selected.name);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!file) { setError('Please upload your medical license document.'); return; }

    setLoading(true);
    setUploadProgress('Uploading license document...');

    try {
      // One multipart/form-data request — server handles storage + user creation
      const body = new FormData();
      body.append('name',           formData.name);
      body.append('email',          formData.email);
      body.append('password',       formData.password);
      body.append('specialization', formData.specialization);
      body.append('licenseNumber',  formData.licenseNumber);
      body.append('licenseFile',    file); // matches upload.single('licenseFile') on server

      setUploadProgress('Submitting registration...');

      const response = await fetch(`${API_URL}/api/doctor/register`, {
        method: 'POST',
        // Do NOT set Content-Type — browser sets it with the correct boundary
        body,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Registration failed');

      localStorage.setItem('authToken', data.token);
      localStorage.setItem('user', JSON.stringify({
        id: data.userId, name: data.name, email: data.email,
        role: 'doctor', status: 'pending',
      }));

      navigate('/pending'); 
      
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-8">

        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-800">Doctor Registration</h2>
          <p className="text-gray-500 text-sm mt-2">
            Submit your details for verification. You'll be approved within 1–2 business days.
          </p>
        </div>

        {error && (
          <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input name="name" type="text" placeholder="Dr. Jane Smith" value={formData.name}
              onChange={handleChange} required disabled={loading}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input name="email" type="email" placeholder="doctor@hospital.com" value={formData.email}
              onChange={handleChange} required disabled={loading}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input name="password" type="password" placeholder="At least 6 characters" value={formData.password}
              onChange={handleChange} required minLength={6} disabled={loading}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Specialization</label>
            <select name="specialization" value={formData.specialization} onChange={handleChange}
              required disabled={loading}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition bg-white">
              <option value="">Select your specialty...</option>
              {SPECIALIZATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Medical License Number</label>
            <input name="licenseNumber" type="text" placeholder="e.g. MED-12345678" value={formData.licenseNumber}
              onChange={handleChange} required disabled={loading}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Medical License Document <span className="text-gray-400 font-normal">(PDF, JPG, PNG — max 10MB)</span>
            </label>
            <label className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-xl p-6 cursor-pointer transition
              ${fileName ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'}`}>
              {fileName ? (
                <>
                  <span className="text-indigo-600 font-medium text-sm">{fileName}</span>
                  <span className="text-gray-400 text-xs mt-1">Click to replace</span>
                </>
              ) : (
                <>
                  <span className="text-gray-500 text-sm">Click to upload your license document</span>
                  <span className="text-gray-400 text-xs mt-1">PDF, JPG, or PNG accepted</span>
                </>
              )}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} disabled={loading} className="hidden" />
            </label>
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? (uploadProgress || 'Processing...') : 'Register as Doctor'}
          </button>

          {loading && (
            <p className="text-xs text-gray-400 text-center animate-pulse">
              Please don't close or refresh this page...
            </p>
          )}

          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <a href="/login" className="text-indigo-600 hover:underline font-medium">Log in</a>
          </p>
        </form>
      </div>
    </div>
  );
};

export default DoctorRegistration;