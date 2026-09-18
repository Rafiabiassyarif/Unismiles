import React, { useState } from 'react';
import { Sparkles, Lock, ArrowRight, Loader2, AlertCircle, LogIn, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth, type User } from '../components/AuthProvider';
import api, { getAuthUser, parseAuthResponse } from '../lib/api';

const logoImg = '/src/logo.png';

export const Auth: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      });
      const { token, user: responseUser } = parseAuthResponse(response.data);
      let user = responseUser as unknown as User | undefined;

      // Some backend versions return the token first and expose the profile
      // only through /auth/me. Fetch it before marking the session complete.
      if (!user) {
        const meResponse = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        user = getAuthUser(meResponse.data) as unknown as User | null;
      }

      if (!user) {
        throw new Error('Server login tidak mengembalikan data pengguna.');
      }

      login(token, user);
    } catch (err: any) {
      // 429 = rate limit, bukan "Network Error". Tanpa cabang ini, pesan
      // servernya ("Too many requests, coba lagi dalam N detik") hilang dan
      // pengguna hanya melihat "Network Error" yang menyesatkan.
      const status = err?.response?.status;
      const serverMessage = err?.response?.data?.message || err?.response?.data?.error;
      const retryAfter = err?.response?.data?.retry_after_seconds;

      let errorMessage: string;
      if (status === 429) {
        errorMessage = retryAfter
          ? `Terlalu banyak percobaan login. Coba lagi dalam ${retryAfter} detik.`
          : 'Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.';
      } else if (status === 401) {
        errorMessage = 'Email atau password tidak valid.';
      } else if (serverMessage) {
        errorMessage = serverMessage;
      } else if (status) {
        errorMessage = `Login gagal (HTTP ${status}).`;
      } else if (err?.code === 'ECONNABORTED' || /timeout/i.test(String(err?.message))) {
        errorMessage = 'Backend tidak merespons (timeout). Coba lagi sebentar.';
      } else {
        errorMessage = 'Backend tidak dapat dihubungi. Periksa koneksi, lalu coba lagi.';
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex overflow-hidden font-sans relative">
      <div className="absolute inset-0 z-0" style={{ background: 'linear-gradient(to bottom, #10172A, #223148)' }} />

      <div className="hidden lg:flex flex-1 relative flex-col justify-between p-16 overflow-hidden z-10">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center">
          <img src={logoImg} alt="Uni-Smiles Logo" className="h-28 w-auto object-contain" />
        </motion.div>

        <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: "easeOut" }}>
          <h1 className="text-6xl font-display font-black leading-[1.1] mb-6 text-foreground uppercase tracking-tighter">
            Empower Your <br />
            <span className="text-primary italic">Kiosk Business.</span>
          </h1>
          <p className="text-xl text-muted max-w-md leading-relaxed font-bold">
            Smart Photo Booth Management Dashboard for high-performance operations.
          </p>
        </motion.div>

        <div className="relative">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary/40">
            <div className="w-1 h-1 rounded-full bg-primary" />
            SECURE ADMIN ACCESS ONLY
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 relative z-10">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
          <div className="bg-[#1E293B] border border-white/5 p-10 shadow-[0_30px_60px_rgba(0,0,0,0.5)] rounded-[3rem]">
            <div className="mb-10">
              <h2 className="text-3xl font-display font-black mb-2 text-foreground tracking-tight uppercase">
                WELCOME BACK
              </h2>
              <p className="text-muted text-sm font-bold">
                Identify yourself to access the control panel.
              </p>
            </div>

            {error && (
              <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">
                  Email
                </label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-primary transition-colors" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="w-full bg-black/20 border border-white/5 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-primary/40 focus:bg-black/30 transition-all text-sm font-bold text-foreground"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">
                  Password
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-primary transition-colors" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="********"
                    className="w-full bg-black/20 border border-white/5 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-primary/40 focus:bg-black/30 transition-all text-sm font-bold text-foreground"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <div className="flex items-center gap-3">
                    <LogIn className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    <span>MASUK KE DASHBOARD</span>
                  </div>
                )}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
