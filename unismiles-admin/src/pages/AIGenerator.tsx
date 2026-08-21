import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Copy, History, Trash2, Loader2, ExternalLink, X } from 'lucide-react';
import { generateMarketingContent } from '../lib/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../components/AuthProvider';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: any;
  images?: string[];
}

const POSE_DATABASE = {
  couple: {
    keywords: ['pacar', 'pasangan', 'berdua', 'dua', 'couple'],
    intro: "Wah, mau foto berdua ya? Ini nih referensi pose couple yang gemas buat kalian! 👩‍❤️‍👨✨",
    links: [
      "https://image.popbela.com/post/20250110/d36972494c869601941630a9aba8fe33.jpg",
      "https://www.lemon8-app.com/seo/image?item_id=7142323542443491842&index=2&sign=ba710013283b5c823dd3ec8a05863fc2"
    ]
  },
  group: {
    keywords: ['teman', 'friends', 'ramai', 'group', 'banyak', 'geng'],
    intro: "Lagi bareng bestie ya? Cek referensi pose grup yang seru dan anti-mainstream ini! 👯‍♀️🔥",
    links: [
      "https://i.pinimg.com/736x/84/50/e1/8450e1b41f890b38d2611418a100c4e1.jpg",
      "https://id.pinterest.com/pin/22166223162991034/"
    ]
  },
  solo: {
    keywords: ['sendiri', 'solo', 'jomblo', 'me time', 'mamba'],
    intro: "Wah, mau foto solo ya? Ini nih referensi pose jomblo berkelas buat kamu! ✨😎",
    links: [
      "https://i.pinimg.com/736x/f2/18/bc/f218bc9a3b71be1e7a224ec7c1e80589.jpg",
      "https://i.pinimg.com/736x/96/48/f9/9648f97c084cce1bc43a6d19ff9f6500.jpg",
      "https://i.pinimg.com/1200x/cb/a0/2e/cba02eeeda4cac5c8338a2998a75cc33.jpg"
    ]
  }
};

const HISTORY_KEY = 'unismiles_ai_history';

export const AIGenerator: React.FC = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<any[]>(() => {
    const saved = localStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [selectedLightboxImage, setSelectedLightboxImage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    "Kasih ide pose buat berdua dong",
    "Buat caption promo buat Kiosk di Braga",
    "Saran strategi bisnis buat Kiosk TULT",
    "Pose solo mamba yang keren"
  ];

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history, user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isLoading || !user) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // 2-second thinking delay
    setTimeout(async () => {
      let aiResponse = "";
      let aiImages: string[] = [];
      const lowerText = text.toLowerCase();
      
      // 1. POSE DETECTION
      let poseCategory = null;
      if (POSE_DATABASE.couple.keywords.some(k => lowerText.includes(k))) poseCategory = POSE_DATABASE.couple;
      else if (POSE_DATABASE.group.keywords.some(k => lowerText.includes(k))) poseCategory = POSE_DATABASE.group;
      else if (POSE_DATABASE.solo.keywords.some(k => lowerText.includes(k))) poseCategory = POSE_DATABASE.solo;

      if (poseCategory && lowerText.includes('pose')) {
        aiResponse = poseCategory.intro;
        // Pick one random image from the category
        const randomIndex = Math.floor(Math.random() * poseCategory.links.length);
        aiImages = [poseCategory.links[randomIndex]];
      } 
      // 2. PROMO/MARKETING DETECTION
      else if (lowerText.includes('promo') || lowerText.includes('caption')) {
        const location = lowerText.includes('braga') ? 'Braga' : lowerText.includes('fit') ? 'FIT' : 'TULT';
        aiResponse = `Siap! Ini caption Instagram estetik buat Kiosk UniSmiles di ${location}: \n\n"Capture your best moments at UniSmiles ${location}! 📸✨ Mumpung lagi ada promo spesial nih, jangan sampai kelewatan ya! Tag your bestie and let's strike a pose! 🌈💖 #UniSmiles #${location}Hits #PhotoBoothBandung"`;
      }
      // 3. BUSINESS STRATEGY DETECTION
      else if (lowerText.includes('strategi') || lowerText.includes('bisnis') || lowerText.includes('saran')) {
        aiResponse = "Saran saya, tambahkan tema 'Toy Story' atau 'Y2K Retro' untuk akhir pekan di Kiosk GIAT TULT karena banyak keluarga dan mahasiswa yang datang! 🚀🧸 Selain itu, coba buat bundle 'Couple Package' untuk meningkatkan transaksi di hari libur.";
      }
      // 4. GENERAL GREETINGS
      else if (lowerText.includes('halo') || lowerText.includes('hi') || lowerText.includes('pagi') || lowerText.includes('siang')) {
        aiResponse = "Halo! Saya UniSmiles AI, asisten cerdas Anda. Ada yang bisa saya bantu hari ini? Saya bisa kasih ide pose, buat caption promo, atau kasih saran strategi bisnis buat Kiosk kamu! 😊";
      }
      // 5. FALLBACK
      else {
        try {
          const geminiResponse = await generateMarketingContent(text);
          aiResponse = geminiResponse || "Maaf, saya tidak dapat memproses permintaan tersebut saat ini. Silakan coba lagi nanti.";
        } catch (error) {
          aiResponse = "Saya mengerti maksud Anda. Sebagai asisten UniSmiles, saya bisa membantu Anda membuat caption promo, ide konsep booth, atau strategi pemasaran. Apa yang ingin Anda buat?";
        }
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: aiResponse,
        timestamp: new Date(),
        images: aiImages
      };

      setMessages(prev => [...prev, aiMsg]);
      setIsLoading(false);

      // Save to Local History
      const newHistoryItem = {
        id: Date.now().toString(),
        prompt: text,
        response: aiResponse,
        timestamp: new Date().toISOString()
      };
      setHistory(prev => [newHistoryItem, ...prev]);
    }, 2000);
  };

  const handleDeleteHistory = async (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const isImageUrl = (url: string) => {
    return url.match(/\.(jpeg|jpg|gif|png|webp)$/) != null || url.includes('lemon8-app.com/seo/image');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="h-[calc(100vh-12rem)] flex flex-col gap-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-4xl font-extrabold tracking-tight flex items-center gap-3">
          <Sparkles className="text-primary neon-text-glow" /> AI Content Generator
        </h1>
        <p className="text-muted mt-1 font-medium">Generate marketing copy, captions, and pose ideas for your business.</p>
      </header>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 glass-panel flex flex-col overflow-hidden neon-border border-primary/20">
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
          >
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-60">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">How can I help you today?</h3>
                  <p className="max-w-md mt-2 text-muted">Try one of the quick prompts below or type your own request to get started.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                  {quickPrompts.map(prompt => (
                    <button
                      key={prompt}
                      onClick={() => handleSend(prompt)}
                      className="p-3 text-sm glass-panel hover:bg-foreground/5 transition-colors text-left"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence>
              {messages.map((msg) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id}
                  className={cn(
                    "flex flex-col max-w-[80%]",
                    msg.role === 'user' ? "ml-auto items-end" : "items-start"
                  )}
                >
                  <div className={cn(
                    "p-4 rounded-2xl text-sm font-medium leading-relaxed",
                    msg.role === 'user' 
                      ? "bg-white/10 text-white rounded-tr-none border border-white/5 shadow-[0_0_15px_rgba(255,255,255,0.05)]" 
                      : "bg-[#0B0F19] text-white rounded-tl-none border border-primary/30 shadow-[0_0_15px_rgba(255,140,102,0.1)]"
                  )}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    
                    {msg.images && msg.images.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {msg.images.map((url, idx) => (
                          isImageUrl(url) ? (
                            <img 
                              key={idx}
                              src={url} 
                              alt="Pose Reference" 
                              onClick={() => {
                                setSelectedLightboxImage(url);
                                setIsLightboxOpen(true);
                              }}
                              className="max-w-[220px] h-auto rounded-2xl border-2 border-zinc-800 shadow-lg hover:scale-[1.02] transition-transform cursor-pointer"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <a 
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 p-3 bg-zinc-800 rounded-xl hover:bg-zinc-700 transition-colors text-xs font-medium text-primary"
                            >
                              <ExternalLink className="w-4 h-4" /> Pose Reference {idx + 1}
                            </a>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted uppercase tracking-widest font-bold">
                    <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.role === 'ai' && (
                      <button 
                        onClick={() => copyToClipboard(msg.content)}
                        className="hover:text-primary transition-colors flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <div className="flex items-center gap-3 text-primary animate-pulse">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">UniSmiles AI is thinking...</span>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-border bg-foreground/5">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="relative"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything... (e.g. Kasih ide pose buat berdua)"
                className="w-full bg-background border border-border rounded-2xl px-6 py-4 pr-16 outline-none focus:border-primary/50 transition-all text-sm text-foreground"
              />
              <button
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 gradient-bg rounded-xl flex items-center justify-center disabled:opacity-50 disabled:grayscale transition-all"
              >
                <Send className="w-5 h-5 text-white" />
              </button>
            </form>
          </div>
        </div>

        {/* History Sidebar */}
        <div className="w-80 glass-panel p-6 flex flex-col gap-6 hidden xl:flex neon-border border-primary/20">
          <h3 className="font-bold text-lg flex items-center gap-2 tracking-tight">
            <History className="w-5 h-5 text-primary neon-text-glow" /> History
          </h3>
          <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar">
              {history.map(item => (
              <button 
                key={item.id}
                onClick={() => {
                  setMessages([
                    { id: 'h1', role: 'user', content: item.prompt, timestamp: item.timestamp ? new Date(item.timestamp) : new Date() },
                    { id: 'h2', role: 'ai', content: item.response, timestamp: item.timestamp ? new Date(item.timestamp) : new Date() }
                  ]);
                }}
                className="w-full text-left p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/5 hover:border-primary/20 group"
              >
                <p className="text-xs font-bold line-clamp-2 text-foreground/80 group-hover:text-primary transition-colors">{item.prompt}</p>
                <div className="mt-2 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] text-muted font-bold uppercase tracking-widest">{item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'N/A'}</span>
                  <Trash2 
                    onClick={(e) => { e.stopPropagation(); handleDeleteHistory(item.id); }}
                    className="w-3 h-3 text-red-400/60 hover:text-red-400" 
                  />
                </div>
              </button>
            ))}
            {history.length === 0 && (
              <p className="text-xs text-muted text-center mt-10 font-bold uppercase tracking-widest">No history yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Image Lightbox */}
      <AnimatePresence>
        {isLightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setIsLightboxOpen(false)}
          >
            <button 
              className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white"
              onClick={(e) => {
                e.stopPropagation();
                setIsLightboxOpen(false);
              }}
            >
              <X className="w-8 h-8" />
            </button>
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={selectedLightboxImage}
              alt="Enlarged Pose Reference"
              className="max-w-[90%] max-h-[90%] object-contain rounded-lg shadow-2xl"
              referrerPolicy="no-referrer"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
