import React from 'react';
import { 
  LayoutDashboard, 
  Image as ImageIcon, 
  History, 
  Sparkles, 
  Monitor, 
  BarChart3, 
  Users, 
  Settings, 
  Bell,
  Search,
  User,
  Sun,
  Moon,
  LogOut,
  AlertCircle
} from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { TemplateManagement } from './pages/TemplateManagement';
import { AIGenerator } from './pages/AIGenerator';
import { Storyboard } from './pages/Storyboard';
import { SessionRepository } from './pages/SessionRepository';
import { KioskManager } from './pages/KioskManager';
import { Analytics } from './pages/Analytics';
import { SettingsPage } from './pages/Settings';
import { UserManager } from './pages/UserManager';
import { Auth } from './pages/Auth';
import { Stickers } from './pages/Stickers';
import { PhotoFilters } from './pages/PhotoFilters';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { cn } from './lib/utils';

import { AuthProvider, useAuth, ErrorBoundary } from './components/AuthProvider';
import { Toaster } from 'sonner';

import { TemplateProvider } from './TemplateContext';
import { KioskProvider } from './KioskContext';
import { SessionProvider } from './SessionContext';

const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles: string[] }> = ({ children, allowedRoles }) => {
  const { user } = useAuth();
  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="h-[calc(100vh-10rem)] flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center justify-center rotate-12 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
          <AlertCircle className="w-12 h-12 text-red-500 -rotate-12" />
        </div>
        <div className="max-w-md space-y-2">
          <h1 className="text-3xl font-display font-black text-foreground uppercase tracking-tight">403 Forbidden</h1>
          <p className="text-muted text-sm font-bold">
            Access Denied. You do not have permission to view this administrative resource.
          </p>
        </div>
        <a 
          href="/dashboard"
          className="px-6 py-3 bg-primary text-[#10172A] rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
        >
          Return to Dashboard
        </a>
      </div>
    );
  }
  return <>{children}</>;
};

function AppContent() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = React.useState(false);
  const displayName = user?.full_name || user?.name || user?.displayName || 'User';
  const avatarSeed = user?.uid || user?.id || 'user';

  const handleLogout = () => {
    logout();
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#10172A]">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-20 border-b border-primary/20 px-8 flex items-center justify-between bg-black/10 backdrop-blur-md z-40 neon-header-glow">
          <div className="relative w-96 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-primary transition-colors" />
            <input 
              placeholder="Search anything..."
              className="w-full bg-white/5 border border-primary/10 rounded-xl pl-12 pr-4 py-2.5 outline-none focus:border-primary/40 transition-all text-sm font-medium focus:shadow-[0_0_15px_rgba(210,199,184,0.1)] text-foreground"
            />
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-[10px] font-extrabold tracking-widest border border-primary/30 text-primary neon-text-glow">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_currentColor]" />
              SYSTEM ONLINE
            </div>
            
            <button className="relative p-2.5 rounded-xl bg-white/5 border border-primary/20 hover:bg-white/10 transition-all text-muted hover:text-primary">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_currentColor]" />
            </button>
            
            <div className="h-8 w-px bg-white/10" />
            
            <div className="flex items-center gap-4 group cursor-pointer">
              <div className="text-right">
                <p className="text-sm font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">{displayName}</p>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-primary/60">
                  {user?.role || 'No Role'}
                </p>
              </div>
              <div className="relative group/avatar">
                <button className="w-10 h-10 rounded-xl bg-white/5 border border-primary/30 flex items-center justify-center hover:bg-white/10 transition-all overflow-hidden shadow-lg">
                  <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`} alt="Avatar" className="w-full h-full object-cover" />
                </button>
                <div className="absolute right-0 top-full mt-3 w-48 glass-panel p-2 hidden group-hover/avatar:block animate-in fade-in slide-in-from-top-2 duration-200 border-primary/30 shadow-2xl">
                  <button 
                    onClick={() => setIsLogoutModalOpen(true)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Header Logout Confirmation Modal */}
        {createPortal(
          isLogoutModalOpen && (
            <div 
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
              onClick={() => setIsLogoutModalOpen(false)}
            >
              <div 
                className="bg-[#1E293B] border border-white/10 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shadow-lg shadow-red-500/10">
                    <LogOut className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Confirm Logout</h3>
                    <p className="text-xs text-muted font-bold mt-2 leading-relaxed">
                      Are you sure you want to logout? You will need to sign in again to access the Uni-Smiles dashboard.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 w-full pt-4">
                    <button 
                      onClick={() => setIsLogoutModalOpen(false)}
                      className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 text-foreground rounded-2xl font-black uppercase tracking-wider text-xs transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleLogout}
                      className="flex-1 py-3.5 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-black uppercase tracking-wider text-xs shadow-lg shadow-red-500/25 transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ),
          document.body
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            {/* Super Admin & Admin Mitra Shared Routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute allowedRoles={['Super Admin', 'Admin Mitra']}>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/kiosks" element={
              <ProtectedRoute allowedRoles={['Super Admin', 'Admin Mitra']}>
                <KioskManager />
              </ProtectedRoute>
            } />
            <Route path="/sessions" element={
              <ProtectedRoute allowedRoles={['Super Admin', 'Admin Mitra']}>
                <SessionRepository />
              </ProtectedRoute>
            } />
            <Route path="/storyboard" element={
              <ProtectedRoute allowedRoles={['Super Admin', 'Admin Mitra']}>
                <Storyboard />
              </ProtectedRoute>
            } />
            <Route path="/ai-generator" element={
              <ProtectedRoute allowedRoles={['Super Admin', 'Admin Mitra']}>
                <AIGenerator />
              </ProtectedRoute>
            } />
            <Route path="/analytics" element={
              <ProtectedRoute allowedRoles={['Super Admin', 'Admin Mitra']}>
                <Analytics />
              </ProtectedRoute>
            } />

            <Route path="/templates" element={
              <ProtectedRoute allowedRoles={['Super Admin', 'Admin Mitra', 'admin_mitra', 'admin']}>
                <TemplateManagement />
              </ProtectedRoute>
            } />
            <Route path="/filters" element={
              <ProtectedRoute allowedRoles={['Super Admin']}>
                <PhotoFilters />
              </ProtectedRoute>
            } />
            <Route path="/users" element={
              <ProtectedRoute allowedRoles={['Super Admin']}>
                <UserManager />
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute allowedRoles={['Super Admin', 'Admin Mitra']}>
                <SettingsPage />
              </ProtectedRoute>
            } />

            {/* Catch-all fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" expand={false} richColors />
      <AuthProvider>
        <TemplateProvider>
          <KioskProvider>
            <SessionProvider>
              <AppContent />
            </SessionProvider>
          </KioskProvider>
        </TemplateProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}


const PlaceholderPage: React.FC<{ title: string; description: string; icon: any }> = ({ title, description, icon: Icon }) => (
  <div className="h-full flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in zoom-in duration-500">
    <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center rotate-12">
      <Icon className="w-12 h-12 text-primary -rotate-12" />
    </div>
    <div className="max-w-md">
      <h1 className="text-3xl font-display font-bold">{title}</h1>
      <p className="text-muted mt-2">{description}</p>
    </div>
    <button className="px-6 py-3 glass-panel hover:bg-foreground/5 transition-all font-bold text-sm">
      Coming Soon in v2.0
    </button>
  </div>
);
