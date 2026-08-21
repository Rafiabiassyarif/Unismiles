import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Image as ImageIcon, 
  History, 
  Sparkles, 
  Monitor, 
  BarChart3, 
  Users, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  LogOut,
  Camera,
  Smile,
  Zap
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';
import { useAuth } from './AuthProvider';
import logoImg from '../logo.png';

interface SidebarProps {
  role?: string;
}

export const Sidebar: React.FC<SidebarProps> = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const menuItems = [
    { id: 'dashboard', path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['Super Admin', 'Admin Mitra'] },
    { id: 'kiosks', path: '/kiosks', icon: Monitor, label: 'Kiosks', roles: ['Super Admin', 'Admin Mitra'] },
    { id: 'sessions', path: '/sessions', icon: History, label: 'Sessions', roles: ['Super Admin', 'Admin Mitra'] },
    { id: 'templates', path: '/templates', icon: Camera, label: 'Frame Templates', roles: ['Super Admin', 'Admin Mitra'] },
    // { id: 'ai-generator', path: '/ai-generator', icon: Sparkles, label: 'AI Gen (Coming Soon)', roles: ['Super Admin', 'Admin Mitra'] },
    // { id: 'analytics', path: '/analytics', icon: BarChart3, label: 'Analytics', roles: ['Super Admin', 'Admin Mitra'] },
    { id: 'filters', path: '/filters', icon: Zap, label: 'Filters', roles: ['Super Admin'] },
    { id: 'users', path: '/users', icon: Users, label: 'Users', roles: ['Super Admin'] },
    { id: 'settings', path: '/settings', icon: Settings, label: 'Settings', roles: ['Super Admin', 'Admin Mitra'] },
  ];

  const handleLogout = () => {
    logout();
    window.location.reload();
  };

  const userRole = user?.role || 'Admin Mitra';
  const filteredItems = menuItems.filter(item => item.roles.includes(userRole));
  const activeId = [...menuItems]
    .sort((a, b) => b.path.length - a.path.length)
    .find(item => location.pathname.startsWith(item.path))?.id || 'dashboard';

  return (
    <aside 
      className={cn(
        "h-screen border-y-0 border-l-0 rounded-none flex flex-col transition-all duration-300 ease-in-out z-50 backdrop-blur-xl relative",
        "border-r border-white/10 shadow-[5px_0_30px_rgba(0,0,0,0.3)] bg-[#1E293B]",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className={cn("p-6 flex items-center", collapsed ? "justify-center p-2" : "gap-3")}>
        {collapsed ? (
          <img 
            src={logoImg} 
            alt="Logo" 
            className="w-20 h-20 object-contain" 
          />
        ) : (
          <img 
            src={logoImg} 
            alt="Uni-Smiles Logo" 
            className="h-20 w-auto object-contain max-w-[220px]" 
          />
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {filteredItems.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            className={cn(
              "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group relative overflow-hidden sidebar-menu-hover",
              activeId === item.id 
                ? "bg-[#FFB800]/10 text-[#FFB800]" 
                : "text-muted hover:text-[#F1F5F9]"
            )}
          >
            {/* Vertical Indicator */}
            {activeId === item.id && (
              <motion.div 
                layoutId="activeIndicator"
                className="absolute left-0 w-1.5 h-6 bg-[#FFB800] rounded-r-full shadow-[4px_0_15px_rgba(255,184,0,0.4)]"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
              />
            )}
            
            <item.icon className={cn(
              "w-5 h-5 transition-all duration-300 group-hover:scale-110",
              activeId === item.id ? "text-[#FFB800] scale-110 drop-shadow-[0_0_8px_rgba(255,184,0,0.3)]" : "text-muted"
            )} />
            {!collapsed && (
              <span className={cn(
                "font-black text-[10px] uppercase tracking-[0.2em] transition-colors",
                activeId === item.id ? "text-[#FFB800]" : "text-muted"
              )}>{item.label}</span>
            )}
          </button>
        ))}
      </nav>

      {!collapsed && (
        <div className="px-6 py-4 mx-3 mb-2 bg-black/20 rounded-2xl border border-white/5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0F172A] border border-white/10 flex items-center justify-center overflow-hidden">
             <div className="w-full h-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-xs">
              {(user?.full_name || user?.name)
                ? (user?.full_name || user?.name)?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
                 : 'U'}
             </div>
          </div>
          <div className="flex-1 overflow-hidden">
             <p className="text-[10px] font-black text-foreground uppercase tracking-tight truncate">{user?.full_name || user?.name || 'User'}</p>
             <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest truncate">
               {user?.role || 'No Role'}
             </p>
          </div>
        </div>
      )}

      <div className="p-4 border-t border-white/5 space-y-1">
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-3 px-4 py-3 text-muted hover:text-foreground transition-all rounded-xl hover:bg-white/5"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          {!collapsed && <span className="font-bold text-sm">Minimize</span>}
        </button>
        <button 
          onClick={() => setIsLogoutModalOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 text-red-400/80 hover:text-red-400 transition-all rounded-xl hover:bg-red-500/10 group cursor-pointer"
          title="Logout"
        >
          <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          {!collapsed && <span className="font-bold text-sm">Logout</span>}
        </button>
      </div>

      {createPortal(
        <AnimatePresence>
          {isLogoutModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
              onClick={() => setIsLogoutModalOpen(false)}
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 10 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#1E293B] border border-white/10 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden"
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
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </aside>
  );
};
