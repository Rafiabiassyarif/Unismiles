import React from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Calendar,
  Download,
  Loader2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { useSession } from '../SessionContext';

export const Analytics: React.FC = () => {
  const { sessions, loading } = useSession();

  // Aggregations
  const hourlyData = Array.from({ length: 24 }, (_, i) => ({
    time: `${i.toString().padStart(2, '0')}:00`,
    sessions: 0
  }));

  const dailyRevenue: Record<string, number> = {};
  const templateUsage: Record<string, number> = {};

  sessions.forEach(s => {
    let date: Date;
    if (s.timestamp && typeof (s.timestamp as any).toDate === 'function') {
      date = (s.timestamp as any).toDate();
    } else if (s.timestamp) {
      date = new Date(s.timestamp);
    } else {
      date = new Date();
    }
    
    if (isNaN(date.getTime())) date = new Date();
    
    const hour = date.getHours();
    hourlyData[hour].sessions += 1;

    const dateKey = date.toLocaleDateString();
    dailyRevenue[dateKey] = (dailyRevenue[dateKey] || 0) + (s.amount || 0);

    const templateId = s.template || 'Default';
    templateUsage[templateId] = (templateUsage[templateId] || 0) + 1;
  });

  const revenueChartData = Object.entries(dailyRevenue).map(([name, value]) => ({ name, value }));
  const templateRanking = Object.entries(templateUsage)
    .map(([name, usage]) => ({ name, usage }))
    .sort((a, b) => b.usage - a.usage);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Analytics & Reports</h1>
          <p className="text-muted mt-1 font-medium">Deep dive into your business performance metrics.</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 glass-panel hover:bg-white/5 transition-all flex items-center gap-2 text-sm font-bold border-primary/20">
            <Calendar className="w-4 h-4 text-primary" /> All Time
          </button>
          <button className="px-6 py-3 gradient-bg rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2 text-sm font-extrabold shadow-[0_0_15px_rgba(255,140,102,0.4)] text-white">
            <Download className="w-5 h-5" /> Export Report
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Total Sessions', value: sessions.length.toLocaleString(), icon: TrendingUp, trend: 'Live', neonClass: 'neon-border' },
          { label: 'Total Revenue', value: `Rp ${sessions.reduce((acc, s) => acc + (s.amount || 0), 0).toLocaleString()}`, icon: Users, trend: 'Live', neonClass: 'neon-border-peach' },
          { label: 'Avg. Revenue/Session', value: `Rp ${sessions.length ? Math.round(sessions.reduce((acc, s) => acc + (s.amount || 0), 0) / sessions.length).toLocaleString() : 0}`, icon: BarChart3, trend: 'Live', neonClass: 'neon-border-butter' },
        ].map((stat, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={stat.label} 
            className={cn("glass-panel p-6 group transition-all duration-500", stat.neonClass)}
          >
            <div className="flex justify-between items-center">
              <div className="p-3 bg-white/5 rounded-xl group-hover:bg-primary/10 transition-colors">
                <stat.icon className="w-6 h-6 text-primary neon-text-glow" />
              </div>
              <span className="text-[10px] font-extrabold px-2 py-1 bg-primary/10 text-primary rounded-full tracking-widest shadow-[0_0_5px_rgba(255,184,0,0.2)]">
                {stat.trend}
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-muted text-xs font-bold uppercase tracking-widest">{stat.label}</h3>
              <p className="text-3xl font-extrabold mt-1 tracking-tight text-foreground">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Peak Hours Heatmap */}
        <div className="glass-panel p-6 neon-border border-primary/20">
          <h3 className="text-lg font-bold tracking-tight mb-6 text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary neon-text-glow" /> Hourly Session Distribution
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#ffffff40" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tick={{ fontWeight: 700 }}
                />
                <YAxis 
                  stroke="#ffffff40" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tick={{ fontWeight: 700 }}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,140,102,0.05)' }}
                  contentStyle={{ 
                    backgroundColor: '#0B0F19', 
                    border: '2px solid rgba(255,184,0,0.4)', 
                    borderRadius: '16px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(255,184,0,0.2)',
                    padding: '12px'
                  }}
                  labelStyle={{ color: '#ffffff', fontWeight: 800, marginBottom: '4px', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.1em' }}
                  itemStyle={{ color: '#FFB800', fontWeight: 900, fontSize: '14px' }}
                  formatter={(value: any) => [`${value} Sessions`, 'Peak Hours']}
                />
                <Bar 
                  dataKey="sessions" 
                  fill="#FFB800" 
                  radius={[4, 4, 0, 0]} 
                  className="drop-shadow-[0_0_8px_rgba(255,184,0,0.4)]"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue Trend */}
        <div className="glass-panel p-6 neon-border-peach border-secondary/20">
          <h3 className="text-lg font-bold tracking-tight mb-6 text-foreground flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-secondary neon-text-glow" /> Daily Revenue Trend
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#ffffff40" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tick={{ fontWeight: 700 }}
                />
                <YAxis 
                  stroke="#ffffff40" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tick={{ fontWeight: 700 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0B0F19', 
                    border: '2px solid rgba(255,107,0,0.4)', 
                    borderRadius: '16px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(255,107,0,0.2)',
                    padding: '12px'
                  }}
                  labelStyle={{ color: '#ffffff', fontWeight: 800, marginBottom: '4px', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.1em' }}
                  itemStyle={{ color: '#FF6B00', fontWeight: 900, fontSize: '14px' }}
                  formatter={(value: any) => [`Rp ${value.toLocaleString()}`, 'Daily Revenue']}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#FF6B00" 
                  strokeWidth={3} 
                  dot={{ fill: '#FF6B00', strokeWidth: 2, r: 4, stroke: '#0B0F19' }}
                  activeDot={{ r: 6, strokeWidth: 0, className: 'drop-shadow-[0_0_10px_#FF6B00]' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Template Performance Table */}
      <div className="glass-panel p-8 neon-border border-primary/20">
        <h3 className="text-xl font-bold tracking-tight mb-8 text-foreground flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-primary neon-text-glow" /> Template Performance Ranking
        </h3>
        <div className="space-y-4">
          {templateRanking.map((item, i) => (
            <div key={item.name} className="flex items-center justify-between p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-primary/30 transition-all group">
              <div className="flex items-center gap-6">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-extrabold text-xs text-primary shadow-[0_0_10px_rgba(255,140,102,0.2)]">
                  {i + 1}
                </div>
                <div>
                  <h4 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">{item.name}</h4>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted">Template ID</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-extrabold text-foreground neon-text-glow">{item.usage} <span className="text-xs font-bold text-muted uppercase tracking-widest ml-1">uses</span></p>
              </div>
            </div>
          ))}
          {templateRanking.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <BarChart3 className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-bold uppercase tracking-widest opacity-50">No template usage data yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
