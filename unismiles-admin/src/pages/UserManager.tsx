import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  Key, 
  Power, 
  Eye, 
  X, 
  Check,
  ChevronDown,
  Building2,
  Monitor,
  Calendar,
  Filter,
  Info,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../components/AuthProvider';
import api from '../lib/api';

// --- Types ---

type Role = 'Super Admin' | 'Admin Mitra' | 'Viewer';

type ServiceMode = 
  | 'Self-managed' 
  | 'Managed by Uni Inside' 
  | 'View Only' 
  | 'Platform Owner' 
  | 'Managed Support';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: Role;
  partner: string;
  serviceMode: ServiceMode;
  assignedKiosks: string[];
  status: 'Active' | 'Inactive';
  lastActive: string;
  notes?: string;
}

interface RoleDefinition {
  name: Role;
  description: string;
  access: string[];
}

// --- Constants & Defaults ---

const USERS_STORAGE_KEY = 'unismiles_users';
const ROLES_STORAGE_KEY = 'unismiles_roles';
const CURRENT_USER_SIM_KEY = 'unismiles_current_user';

const DEFAULT_ROLES: RoleDefinition[] = [
  {
    name: 'Super Admin',
    description: 'Uni Inside internal team with full platform access.',
    access: [
      'Manage all partners', 'Manage all kiosks', 'Manage all templates',
      'Manage all sessions', 'Manage all analytics', 'Manage users and roles',
      'Configure system settings', 'Assist partner operations'
    ]
  },
  {
    name: 'Admin Mitra',
    description: 'Partner account that manages only assigned business and kiosks.',
    access: [
      'View own dashboard', 'Manage own templates', 'Manage own AI content',
      'Manage own storyboard layouts', 'View own sessions', 'View own analytics',
      'Configure assigned kiosks', 'Manage own photo filters and branding'
    ]
  },
  {
    name: 'Viewer',
    description: 'Read-only account for partners who only need reports.',
    access: [
      'View dashboard', 'View sessions', 'View analytics', 'Export reports'
    ]
  }
];

const DEFAULT_USERS: UserRecord[] = [
  {
    id: '1',
    name: 'Uni Inside Owner',
    email: 'superadmin@gmail.com',
    role: 'Super Admin',
    partner: 'All Partners',
    serviceMode: 'Platform Owner',
    assignedKiosks: ['All Kiosks'],
    status: 'Active',
    lastActive: 'Today'
  },
  {
    id: '2',
    name: 'Uni Inside Operator',
    email: 'operator@uniinside.com',
    role: 'Super Admin',
    partner: 'All Partners',
    serviceMode: 'Managed Support',
    assignedKiosks: ['All Kiosks'],
    status: 'Active',
    lastActive: 'Today'
  },
  {
    id: '3',
    name: 'Admin Kafe Senja',
    email: 'admin@gmail.com',
    role: 'Admin Mitra',
    partner: 'Kafe Senja',
    serviceMode: 'Self-managed',
    assignedKiosks: ['Kiosk Senja 01'],
    status: 'Active',
    lastActive: 'Yesterday'
  },
  {
    id: '4',
    name: 'Admin Wedding Expo',
    email: 'event@weddingexpo.com',
    role: 'Admin Mitra',
    partner: 'Wedding Expo 2026',
    serviceMode: 'Managed by Uni Inside',
    assignedKiosks: ['Kiosk Event 01', 'Kiosk Event 02'],
    status: 'Active',
    lastActive: '2 days ago'
  },
  {
    id: '5',
    name: 'Report Viewer',
    email: 'viewer@client.com',
    role: 'Viewer',
    partner: 'Kafe Senja',
    serviceMode: 'View Only',
    assignedKiosks: ['Kiosk Senja 01'],
    status: 'Inactive',
    lastActive: 'Last week'
  }
];

const KIOSK_OPTIONS = [
  'Kiosk Senja 01',
  'Kiosk Event 01',
  'Kiosk Event 02',
  'Kiosk Mall 01',
  'Kiosk Campus 01'
];

const PERMISSION_MATRIX = [
  { feature: 'Dashboard', super: 'Full Access', mitra: 'Own Data Only', viewer: 'View Only' },
  { feature: 'Templates', super: 'Full Access', mitra: 'Own Data Only', viewer: 'No Access' },
  { feature: 'Sessions', super: 'Full Access', mitra: 'Own Data Only', viewer: 'View Only' },
  { feature: 'AI Content', super: 'Full Access', mitra: 'Own Data Only', viewer: 'No Access' },
  { feature: 'Storyboard', super: 'Full Access', mitra: 'Own Data Only', viewer: 'No Access' },
  { feature: 'Kiosks', super: 'Full Access', mitra: 'Assigned Only', viewer: 'View Only' },
  { feature: 'Analytics', super: 'Full Access', mitra: 'Own Data Only', viewer: 'View Only' },
  { feature: 'Stickers & Icons', super: 'Full Access', mitra: 'Own Data Only', viewer: 'No Access' },
  { feature: 'Photo Filters', super: 'Full Access', mitra: 'Own Data Only', viewer: 'No Access' },
  { feature: 'Settings', super: 'Full Access', mitra: 'Branding Only', viewer: 'No Access' },
  { feature: 'Users', super: 'Full Access', mitra: 'No Access', viewer: 'No Access' },
];

export const UserManager: React.FC = () => {
  const { isAuthenticated } = useAuth();
  // --- State ---
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [roles] = useState<RoleDefinition[]>(() => {
    const saved = localStorage.getItem(ROLES_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_ROLES;
  });

  const [currentUserSim, setCurrentUserSim] = useState(() => {
    return localStorage.getItem(CURRENT_USER_SIM_KEY) || 'Uni Inside Owner';
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('All Roles');
  const [statusFilter, setStatusFilter] = useState<string>('All Status');
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

  const [formData, setFormData] = useState<Omit<UserRecord, 'id' | 'lastActive'>>({
    name: '',
    email: '',
    role: 'Admin Mitra',
    partner: '',
    serviceMode: 'Self-managed',
    assignedKiosks: [],
    status: 'Active',
    notes: ''
  });

  // --- Effects ---
  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    async function fetchUsers() {
      try {
        const res = await api.get("/users");
        const data = res.data;
        setUsers(Array.isArray(data) ? data : (data.data || []));
      } catch (err) {
        console.error("Error fetching users:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, [isAuthenticated]);

  useEffect(() => {
    localStorage.setItem(CURRENT_USER_SIM_KEY, currentUserSim);
  }, [currentUserSim]);

  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveDropdownId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // --- Computed ---
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          u.partner.toLowerCase().includes(searchTerm.toLowerCase());
      const matchRole = roleFilter === 'All Roles' || u.role === roleFilter;
      const matchStatus = statusFilter === 'All Status' || u.status === statusFilter;
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: users.length,
      superAdmins: users.filter(u => u.role === 'Super Admin').length,
      adminMitra: users.filter(u => u.role === 'Admin Mitra').length,
      activePartners: new Set(users.map(u => u.partner)).size
    };
  }, [users]);

  // --- Handlers ---
  const handleOpenModal = (user?: UserRecord) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name,
        email: user.email,
        role: user.role,
        partner: user.partner,
        serviceMode: user.serviceMode,
        assignedKiosks: user.assignedKiosks,
        status: user.status,
        notes: user.notes
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        email: '',
        role: 'Admin Mitra',
        partner: '',
        serviceMode: 'Self-managed',
        assignedKiosks: [],
        status: 'Active',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveUser = async () => {
    if (!formData.name || !formData.email || !formData.role) {
      toast.error('Name, Email, and Role are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error('Please enter a valid email.');
      return;
    }
    if ((formData.role === 'Admin Mitra' || formData.role === 'Viewer') && !formData.partner) {
      toast.error('Partner name is required for this role.');
      return;
    }

    // Check duplicate email
    const duplicate = users.find(u => u.email.toLowerCase() === formData.email.toLowerCase() && u.id !== editingUser?.id);
    if (duplicate) {
      toast.error('User with this email already exists.');
      return;
    }

    try {
      if (editingUser) {
        const res = await api.put(`/users/${editingUser.id}`, formData);
        const updated = res.data.data || res.data;
        setUsers(users.map(u => u.id === editingUser.id ? updated : u));
        toast.success('User updated successfully.');
      } else {
        const res = await api.post("/users", formData);
        const newUser = res.data.data || res.data;
        setUsers([...users, newUser]);
        toast.success('User added successfully.');
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error saving user:", err);
      toast.error("Failed to save user.");
    }
  };

  const handleDeleteUser = async (id: string) => {
    const user = users.find(u => u.id === id);
    if (!user) return;

    if (user.role === 'Super Admin' && users.filter(u => u.role === 'Super Admin' && u.status === 'Active').length <= 1) {
      toast.error('Cannot delete the last active Super Admin.');
      return;
    }

    if (window.confirm(`Are you sure you want to delete ${user.name}?`)) {
      try {
        await api.delete(`/users/${id}`);
        setUsers(users.filter(u => u.id !== id));
        toast.success('User deleted.');
      } catch (err) {
        console.error("Error deleting user:", err);
        toast.error("Failed to delete user.");
      }
    }
  };

  const toggleStatus = async (id: string) => {
    const user = users.find(u => u.id === id);
    if (!user) return;
    const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const res = await api.put(`/users/${id}`, { status: newStatus });
      const updated = res.data.data || res.data;
      setUsers(users.map(u => u.id === id ? updated : u));
      toast.success('Status updated.');
    } catch (err) {
      console.error("Error toggling status:", err);
    }
  };

  const resetPassword = (email: string) => {
    toast.info(`Password reset link generated successfully for ${email}.`);
  };

  const currentSimUser = users.find(u => u.name === currentUserSim) || users[0] || {
    id: "fallback",
    name: currentUserSim,
    email: "owner@uniinside.com",
    role: "Super Admin",
    partner: "All Partners",
    serviceMode: "Platform Owner",
    assignedKiosks: ["All Kiosks"],
    status: "Active",
    lastActive: "Today"
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-5xl font-black tracking-tighter uppercase leading-[0.8] mb-2 text-foreground">Personnel</h1>
          <p className="text-muted text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Identity Governance & System Permissions</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center gap-3 px-10"
        >
          <UserPlus className="w-5 h-5" />
          Add Personnel
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Nodes', value: stats.total, icon: Users, color: 'text-[#FFB800]' },
          { label: 'Governance', value: stats.superAdmins, icon: ShieldCheck, color: 'text-blue-400' },
          { label: 'Business Ops', value: stats.adminMitra, icon: Building2, color: 'text-emerald-400' },
          { label: 'Active Orgs', value: stats.activePartners, icon: Monitor, color: 'text-primary' }
        ].map((s, idx) => (
          <div key={idx} className="bg-[#1E293B] border border-white/5 p-8 rounded-3xl group hover:border-primary/40 transition-all shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-muted uppercase tracking-[0.3em]">{s.label}</p>
                <h3 className="text-3xl font-black mt-3 text-foreground tracking-tighter">{s.value}</h3>
              </div>
              <div className={cn("p-4 bg-white/5 rounded-2xl group-hover:bg-primary/10 transition-all", s.color)}>
                <s.icon className="w-8 h-8" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* User Actions & Table */}
      <div className="bg-[#1E293B] border border-white/5 rounded-[3rem] shadow-2xl overflow-hidden">
        <div className="p-8 border-b border-white/5 bg-black/10 flex flex-col md:flex-row items-center gap-6">
          <div className="relative flex-1 w-full group">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-primary transition-colors" />
            <input 
              type="text" 
              placeholder="Search directory by name, email, or network..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/20 border border-white/5 rounded-2xl pl-14 pr-6 py-4 outline-none focus:border-primary/40 transition-all text-sm font-black text-foreground"
            />
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative group w-full md:w-56">
              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
              <select 
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full bg-black/20 border border-white/5 rounded-2xl pl-11 pr-10 py-4 outline-none focus:border-primary/40 transition-all text-[10px] font-black uppercase tracking-widest appearance-none cursor-pointer text-foreground"
              >
                <option value="All Roles" className="bg-[#1E293B]">All Roles</option>
                <option value="Super Admin" className="bg-[#1E293B]">Super Admin</option>
                <option value="Admin Mitra" className="bg-[#1E293B]">Admin Mitra</option>
                <option value="Viewer" className="bg-[#1E293B]">Viewer</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
            </div>

            <div className="relative group w-full md:w-56">
              <Power className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-black/20 border border-white/5 rounded-2xl pl-11 pr-10 py-4 outline-none focus:border-primary/40 transition-all text-[10px] font-black uppercase tracking-widest appearance-none cursor-pointer text-foreground"
              >
                <option value="All Status" className="bg-[#1E293B]">All Status</option>
                <option value="Active" className="bg-[#1E293B]">Active</option>
                <option value="Inactive" className="bg-[#1E293B]">Inactive</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto select-none">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 text-[9px] font-black text-muted uppercase tracking-[0.2em]">
                <th className="px-8 py-6">Personnel Info</th>
                <th className="px-8 py-6">Governance/Role</th>
                <th className="px-8 py-6">Network/Partner</th>
                <th className="px-8 py-6">Connectivity</th>
                <th className="px-8 py-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUsers.map((user) => (
                <tr 
                  key={user.id} 
                  className={cn(
                    "group hover:bg-white/5 transition-all",
                    user.status === 'Inactive' && "opacity-40 grayscale"
                  )}
                >
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-[#FFB800] font-black border border-white/5 group-hover:border-primary/40 transition-all">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-black text-foreground tracking-tight uppercase">{user.name}</div>
                        <div className="text-[10px] text-muted font-black uppercase tracking-widest opacity-60">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className={cn(
                      "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black border uppercase tracking-widest",
                      user.role === 'Super Admin' ? "bg-[#FFB800]/10 border-[#FFB800]/20 text-[#FFB800]" :
                      user.role === 'Admin Mitra' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                      "bg-white/5 border-white/10 text-muted"
                    )}>
                      {user.role}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="text-[10px] font-black text-foreground uppercase tracking-widest">{user.partner}</div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          user.status === 'Active' ? "bg-emerald-400 animate-pulse" : "bg-white/20"
                        )} />
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-widest",
                          user.status === 'Active' ? "text-emerald-400" : "text-muted"
                        )}>
                          {user.status === 'Active' ? 'Verified Online' : 'System Offline'}
                        </span>
                      </div>
                      <span className="text-[8px] text-muted font-black uppercase opacity-40">Sync: {user.lastActive}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-3">
                       <button 
                        onClick={() => handleOpenModal(user)}
                        className="p-3 bg-white/5 hover:bg-[#FFB800]/10 hover:text-[#FFB800] rounded-2xl transition-all text-muted"
                        title="Modify"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => toggleStatus(user.id)}
                        className={cn(
                          "p-3 rounded-2xl transition-all",
                          user.status === 'Active' ? "bg-white/5 text-muted hover:bg-red-500/10 hover:text-red-400" : "bg-white/5 text-muted hover:bg-emerald-500/10 hover:text-emerald-400"
                        )}
                        title={user.status === 'Active' ? "Disable Access" : "Grant Access"}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      <div className="relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDropdownId(activeDropdownId === user.id ? null : user.id);
                          }}
                          className="p-3 bg-white/5 text-muted hover:text-foreground transition-all rounded-2xl cursor-pointer"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        <div className={cn(
                          "absolute right-0 bottom-full mb-3 w-48 bg-[#1E293B] border border-white/5 p-2 z-50 shadow-2xl rounded-2xl transition-all",
                          activeDropdownId === user.id ? "block" : "hidden"
                        )}>
                          <button 
                            onClick={() => resetPassword(user.email)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted hover:text-foreground hover:bg-white/5 rounded-xl transition-all cursor-pointer"
                          >
                            <Key className="w-4 h-4" /> New Credentials
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(user.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-white hover:bg-red-500 rounded-xl transition-all cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" /> Hapus User
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Role & Permission Matrix */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-4">
            <Shield className="w-6 h-6 text-[#FFB800]" />
            <h2 className="text-xl font-black uppercase tracking-tighter text-foreground">Permission Matrix</h2>
          </div>
          
          <div className="bg-[#1E293B] border border-white/5 rounded-[3rem] shadow-2xl overflow-hidden p-8">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 text-[9px] font-black text-muted uppercase tracking-[0.2em] bg-black/10">
                    <th className="px-6 py-5 rounded-tl-3xl">System Module</th>
                    <th className="px-6 py-5 text-center">Super Admin</th>
                    <th className="px-6 py-5 text-center">Admin Mitra</th>
                    <th className="px-6 py-5 text-center rounded-tr-3xl">Viewer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {PERMISSION_MATRIX.map((p, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition-all">
                      <td className="px-6 py-4 text-[10px] font-black text-foreground uppercase tracking-widest">{p.feature}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-[8px] font-black px-3 py-1 rounded-full bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/20 uppercase tracking-widest">
                          {p.super}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "text-[8px] font-black px-3 py-1 rounded-full border uppercase tracking-widest",
                          p.mitra === 'No Access' ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                        )}>
                          {p.mitra}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "text-[8px] font-black px-3 py-1 rounded-full border uppercase tracking-widest",
                          p.viewer === 'No Access' ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-white/5 border-white/10 text-muted"
                        )}>
                          {p.viewer}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Access Simulation */}
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Zap className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-black uppercase tracking-tighter text-foreground">Simulation</h2>
          </div>
          
          <div className="bg-[#1E293B] border border-white/5 rounded-[3rem] shadow-2xl p-10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 blur-[80px] -translate-y-24 translate-x-24 rounded-full group-hover:bg-primary/10 transition-all duration-1000" />
            
            <div className="space-y-8 relative z-10">
              <div className="space-y-4">
                <label className="text-[9px] font-black text-muted uppercase tracking-[0.3em] ml-1">Identity Simulation</label>
                <div className="relative">
                  <select 
                    value={currentUserSim}
                    onChange={(e) => setCurrentUserSim(e.target.value)}
                    className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-primary/40 appearance-none font-black text-xs text-foreground uppercase tracking-widest cursor-pointer"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.name} className="bg-[#1E293B]">{u.name.toUpperCase()} / {u.role.toUpperCase()}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                </div>
              </div>

              <div className="p-8 rounded-[2rem] bg-black/40 border border-white/5 space-y-6 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                    <Info className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Policy Intelligence</span>
                </div>
                <p className="text-[11px] text-muted leading-relaxed font-bold uppercase tracking-wider">
                  {currentSimUser.role === 'Super Admin' && "Governance Node: Full administrative authority over all partners, kiosks, users, systems, and cryptographic protocols."}
                  {currentSimUser.role === 'Admin Mitra' && "Partner Node: Restricted authority limited to owned business vertical, assigned kiosk infrastructure, and local assets."}
                  {currentSimUser.role === 'Viewer' && "Observer Node: Read-only access to analytics telemetry without modification privileges to platform state."}
                </p>
                <div className="pt-4 border-t border-white/5">
                  <div className="text-[8px] font-black text-muted uppercase tracking-[0.3em] mb-4">Core Privileges:</div>
                  <div className="flex flex-wrap gap-2">
                    {roles.find(r => r.name === currentSimUser.role)?.access.slice(0, 4).map((a, i) => (
                      <span key={i} className="text-[8px] px-3 py-1.5 bg-primary/5 text-primary rounded-xl border border-primary/20 font-black uppercase tracking-widest">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl glass-panel p-8 border-primary/30 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute top-6 right-6 text-muted hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-primary/10 rounded-xl">
                  {editingUser ? <Edit2 className="w-6 h-6 text-primary" /> : <UserPlus className="w-6 h-6 text-primary" />}
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{editingUser ? 'Edit User' : 'Add New User'}</h2>
                  <p className="text-xs text-muted font-medium italic">Configure user identity, role, and platform access level.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">Full Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 text-sm font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">Email Address</label>
                  <input 
                    type="email" 
                    placeholder="name@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 text-sm font-bold"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">Role</label>
                  <div className="relative">
                    <select 
                      value={formData.role}
                      onChange={(e) => {
                        const newRole = e.target.value as Role;
                        setFormData({
                          ...formData, 
                          role: newRole,
                          partner: newRole === 'Super Admin' ? 'All Partners' : formData.partner
                        });
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 appearance-none font-bold text-sm"
                    >
                      <option value="Super Admin">Super Admin</option>
                      <option value="Admin Mitra">Admin Mitra</option>
                      <option value="Viewer">Viewer</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">Business / Partner Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Kafe Senja"
                    disabled={formData.role === 'Super Admin'}
                    value={formData.partner}
                    onChange={(e) => setFormData({...formData, partner: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 text-sm font-bold disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">Service Mode</label>
                  <div className="relative">
                    <select 
                      value={formData.serviceMode}
                      onChange={(e) => setFormData({...formData, serviceMode: e.target.value as ServiceMode})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 appearance-none font-bold text-sm"
                    >
                      <option value="Self-managed">Self-managed</option>
                      <option value="Managed by Uni Inside">Managed by Uni Inside</option>
                      <option value="View Only">View Only</option>
                      <option value="Platform Owner">Platform Owner</option>
                      <option value="Managed Support">Managed Support</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">Status</label>
                  <div className="relative">
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as 'Active' | 'Inactive'})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 appearance-none font-bold text-sm"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">Assigned Kiosks</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {KIOSK_OPTIONS.map(k => (
                      <button 
                        key={k}
                        onClick={() => {
                          const current = [...formData.assignedKiosks];
                          if (current.includes(k)) {
                            setFormData({...formData, assignedKiosks: current.filter(item => item !== k)});
                          } else {
                            setFormData({...formData, assignedKiosks: [...current, k]});
                          }
                        }}
                        className={cn(
                          "px-3 py-2 rounded-lg border text-[10px] font-bold text-left transition-all",
                          formData.assignedKiosks.includes(k) 
                            ? "bg-primary/20 border-primary/40 text-primary" 
                            : "bg-white/5 border-white/10 text-muted hover:border-white/20"
                        )}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-muted italic">* Super Admins are automatically assigned to All Kiosks.</p>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-extrabold text-muted uppercase tracking-widest">Internal Notes</label>
                  <textarea 
                    placeholder="Add private notes about this user account..."
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/40 text-sm font-medium min-h-[80px] resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-6">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-foreground font-bold rounded-xl hover:bg-white/10 transition-all font-display"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveUser}
                  className="flex-1 py-3 bg-primary text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(255,140,102,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all font-display flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
