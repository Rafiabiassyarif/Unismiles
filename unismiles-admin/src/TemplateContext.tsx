import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from './components/AuthProvider';
import api from './lib/api';
import { resolvePublicUrl } from './lib/urls';

export interface SlotCoord {
  index: number;
  x: number;      // percentage (0 - 100)
  y: number;      // percentage (0 - 100)
  width: number;  // percentage (0 - 100)
  height: number; // percentage (0 - 100)
}

export interface LayoutConfig {
  orientation?: 'vertical' | 'horizontal' | 'square' | string;
  slots: SlotCoord[];
}

export interface Template {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  image_url?: string;
  slot_count: number;
  slotCount?: number;
  layout_config?: LayoutConfig | any;
  layoutConfig?: LayoutConfig | any;
  status: 'active' | 'inactive';
  usageCount: number;
  createdAt?: any;
  updatedAt?: any;
  isDummy?: boolean;
}

interface TemplateContextType {
  templates: Template[];
  fetchTemplates: () => Promise<void>;
  addTemplate: (template: Partial<Template> & { name: string; category: string; image_url?: string; imageUrl?: string; slot_count?: number; layout_config?: any }) => Promise<Template | undefined>;
  updateTemplate: (id: string, updates: Partial<Template> & any) => Promise<Template | undefined>;
  editTemplate: (id: string, updates: Partial<Template> & any) => Promise<Template | undefined>;
  deleteTemplate: (id: string) => Promise<void>;
  loading: boolean;
}

const TemplateContext = createContext<TemplateContextType | undefined>(undefined);

export const TemplateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // Helper to parse JSON strings safely
  const tryParseJson = (data: any) => {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (e) {
        return null;
      }
    }
    return data;
  };

  // Helper to resolve relative upload paths to full backend URL
  const resolveImageUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('/uploads')) return resolvePublicUrl(url);
    return url;
  };

  // Helper to parse dates and standardize backend payload to Template interface
  const parseTemplate = (t: any): Template => {
    const rawUrl = t.image_url || t.imageUrl || t.thumbnail || '';
    const imageUrl = resolveImageUrl(rawUrl);
    const slotCount = Number(t.slot_count ?? t.slotCount ?? 3);
    const rawLayout = t.layout_config || t.layoutConfig;
    const parsedLayout = typeof rawLayout === 'string' ? (tryParseJson(rawLayout) || { slots: [] }) : (rawLayout || { slots: [] });

    return {
      id: String(t.id),
      name: t.name || 'Untitled Template',
      category: t.category || 'General',
      imageUrl,
      image_url: imageUrl,
      slot_count: slotCount,
      slotCount: slotCount,
      layout_config: parsedLayout,
      layoutConfig: parsedLayout,
      status: t.status || (t.is_active || t.isActive ? 'active' : 'active'),
      usageCount: Number(t.usageCount ?? t.usage_count ?? t.prints ?? 0),
      createdAt: t.createdAt ? { toDate: () => new Date(t.createdAt) } : (t.created_at ? { toDate: () => new Date(t.created_at) } : { toDate: () => new Date() }),
      updatedAt: t.updatedAt ? { toDate: () => new Date(t.updatedAt) } : (t.updated_at ? { toDate: () => new Date(t.updated_at) } : undefined),
      isDummy: t.isDummy
    };
  };

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/templates");
      const rawData = res.data?.data || res.data;
      if (Array.isArray(rawData)) {
        setTemplates(rawData.map(parseTemplate));
      } else {
        setTemplates([]);
      }
    } catch (err) {
      console.error("Error fetching templates:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchTemplates();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, fetchTemplates]);

  const addTemplate = async (templateData: any): Promise<Template | undefined> => {
    try {
      const imageUrl = templateData.image_url || templateData.imageUrl || '';
      const slotCount = Number(templateData.slot_count ?? templateData.slotCount ?? 3);
      const layoutConfig = templateData.layout_config || templateData.layoutConfig || { slots: [] };

      const payload = {
        name: templateData.name,
        category: templateData.category || 'General',
        image_url: imageUrl,
        slot_count: slotCount,
        layout_config: typeof layoutConfig === 'object' ? JSON.stringify(layoutConfig) : layoutConfig
      };

      const res = await api.post("/admin/templates", payload);
      const newTemplateRaw = res.data?.data || res.data;
      const parsed = parseTemplate(newTemplateRaw);
      
      setTemplates(prev => [parsed, ...prev]);
      return parsed;
    } catch (err: any) {
      console.error("Error adding template:", err);
      toast.error(err.response?.data?.message || "Error adding template to database.");
      throw err;
    }
  };

  const updateTemplate = async (id: string, updates: any): Promise<Template | undefined> => {
    // TODO: Wire up when PUT /admin/templates/:id endpoint is available
    console.warn('updateTemplate: No backend endpoint available yet. Applying locally.');
    const existing = templates.find(t => t.id === id);
    const merged = { ...existing, ...updates, id };
    const parsed = parseTemplate(merged);
    setTemplates(prev => prev.map(t => t.id === id ? parsed : t));
    return parsed;
  };

  const editTemplate = async (id: string, updates: any): Promise<Template | undefined> => {
    return updateTemplate(id, updates);
  };

  const deleteTemplate = async (id: string): Promise<void> => {
    // TODO: Wire up when DELETE /admin/templates/:id endpoint is available
    console.warn('deleteTemplate: No backend endpoint available yet. Removing locally.');
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  return (
    <TemplateContext.Provider value={{ templates, fetchTemplates, addTemplate, updateTemplate, editTemplate, deleteTemplate, loading }}>
      {children}
    </TemplateContext.Provider>
  );
};

export const useTemplate = () => {
  const context = useContext(TemplateContext);
  if (context === undefined) {
    throw new Error('useTemplate must be used within a TemplateProvider');
  }
  return context;
};
