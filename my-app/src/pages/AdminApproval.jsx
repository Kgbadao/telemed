import { API_URL } from '../config';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle, ExternalLink } from 'lucide-react';


// Admin access is enforced by the backend: the request must carry a valid JWT
// whose role is 'admin'. Nothing secret lives in the frontend.
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('authToken')}`,
});

export default function AdminApproval() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPending = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/pending-doctors`, {
        headers: authHeaders(),
      });
      setDoctors(res.data);
    } catch (err) {
      setError(
        err.response?.status === 403 || err.response?.status === 401
          ? 'You need to be logged in as an admin to view this page.'
          : 'Failed to load pending doctors.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPending(); }, []);

  const approve = async (userId) => {
    try {
      await axios.post(`${API_URL}/api/admin/approve-doctor/${userId}`, {}, {
        headers: authHeaders(),
      });
      setDoctors(doctors.filter(d => d.id !== userId));
    } catch {
      setError('Failed to approve doctor.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Pending Doctor Approvals</h1>
      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600 mb-4">{error}</p>}
      {!loading && !error && doctors.length === 0 && (
        <p className="text-gray-500">No pending doctors.</p>
      )}
      <div className="grid gap-4 max-w-3xl">
        {doctors.map(doc => (
          <div key={doc.id} className="bg-white rounded-2xl shadow p-6 flex items-start justify-between gap-4">
            <div>
              <p className="font-bold text-gray-800 text-lg">{doc.name}</p>
              <p className="text-gray-500 text-sm">{doc.email}</p>
              <p className="text-gray-600 text-sm mt-1">Specialty: {doc.specialization}</p>
              <p className="text-gray-600 text-sm">License #: {doc.licenseNumber}</p>
              {doc.licenseURL && (
                <a href={doc.licenseURL} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 text-sm mt-2 hover:underline">
                  View License <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <button
              onClick={() => approve(doc.id)}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition text-sm font-semibold shrink-0"
            >
              <CheckCircle className="w-4 h-4" /> Approve
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}