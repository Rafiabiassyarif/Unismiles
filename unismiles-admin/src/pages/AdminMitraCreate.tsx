import React, { useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../components/AuthProvider';

/**
 * Halaman UI untuk Super Admin menambah Admin Mitra baru.
 * Form ini mengirim data ke endpoint `/api/v1/admin/admin-mitra` dengan
 * header Authorization = Bearer <token>.
 */
export default function AdminMitraCreate() {
  const { token } = useAuth(); // token milik Super Admin yang sedang login
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    partner_name: '',
  });
  const [msg, setMsg] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      const res = await api.post('/admin/admin-mitra', form, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg(res.data.message || 'Admin Mitra berhasil dibuat');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Terjadi kesalahan saat membuat admin mitra';
      setError(msg);
    }
  };

  return (
    <div className="max-w-lg mx-auto my-8 p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Buat Admin Mitra Baru</h2>
      {msg && <div className="p-2 mb-4 text-green-800 bg-green-100 rounded">{msg}</div>}
      {error && <div className="p-2 mb-4 text-red-800 bg-red-100 rounded">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          name="full_name"
          placeholder="Nama Lengkap"
          value={form.full_name}
          onChange={handleChange}
          required
          className="w-full p-2 border rounded"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          required
          className="w-full p-2 border rounded"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          required
          className="w-full p-2 border rounded"
        />
        <input
          name="partner_name"
          placeholder="Nama Mitra"
          value={form.partner_name}
          onChange={handleChange}
          required
          className="w-full p-2 border rounded"
        />
        <button
          type="submit"
          className="w-full py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
        >
          Buat Admin Mitra
        </button>
      </form>
    </div>
  );
}
