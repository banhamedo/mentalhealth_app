import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Volume2, Download, Trash2, Plus, Menu, X, Settings, LayoutDashboard, LogOut, Shield, Heart, Brain, Smile, Sun, Cloud, Moon, Leaf } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { chatWithMentalHealthAI, generateSpeech } from './services/gemini';
import { User as UserType, Conversation, Message, AdminStats } from './types';
import { cn, formatDate } from './utils';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

export default function App() {
  const [user, setUser] = useState<UserType | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginName, setLoginName] = useState('');
  const [view, setView] = useState<'chat' | 'dashboard' | 'admin'>('chat');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminUsers, setAdminUsers] = useState<UserType[]>([]);
  const [adminConvs, setAdminConvs] = useState<Conversation[]>([]);
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      fetchConversations();
      if (user.role === 'admin') {
        fetchAdminData();
      }
    }
  }, [user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async () => {
    if (!user) return;
    const res = await fetch(`/api/conversations/${user.id}`);
    const data = await res.json();
    setConversations(data);
  };

  const fetchMessages = async (convId: number) => {
    const res = await fetch(`/api/messages/${convId}`);
    const data = await res.json();
    setMessages(data);
  };

  const fetchAdminData = async () => {
    const [statsRes, usersRes, convsRes] = await Promise.all([
      fetch('/api/admin/stats'),
      fetch('/api/admin/users'),
      fetch('/api/admin/conversations')
    ]);
    setAdminStats(await statsRes.json());
    setAdminUsers(await usersRes.json());
    setAdminConvs(await convsRes.json());
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, name: loginName })
    });
    const data = await res.json();
    setUser(data);
  };

  const startNewConversation = async () => {
    if (!user) return;
    const title = language === 'ar' ? `محادثة جديدة ${new Date().toLocaleTimeString()}` : `New Chat ${new Date().toLocaleTimeString()}`;
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, title })
    });
    const data = await res.json();
    const newConv = { id: data.id, user_id: user.id, title, created_at: new Date().toISOString() };
    setConversations([newConv, ...conversations]);
    setActiveConversation(newConv);
    setMessages([]);
    setView('chat');
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user || isLoading) return;

    let currentConv = activeConversation;
    if (!currentConv) {
      const title = input.slice(0, 30) + "...";
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, title })
      });
      const data = await res.json();
      currentConv = { id: data.id, user_id: user.id, title, created_at: new Date().toISOString() };
      setConversations([currentConv, ...conversations]);
      setActiveConversation(currentConv);
    }

    const userMsg = input;
    setInput('');
    setIsLoading(true);

    // Save User Message
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: currentConv.id, role: 'user', content: userMsg })
    });

    const updatedMessages = [...messages, { id: Date.now(), conversation_id: currentConv.id, role: 'user' as const, content: userMsg, created_at: new Date().toISOString() }];
    setMessages(updatedMessages);

    // Get AI Response
    const aiResponse = await chatWithMentalHealthAI(
      updatedMessages.map(m => ({ role: m.role, content: m.content })),
      userMsg
    );

    // Save AI Message
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: currentConv.id, role: 'assistant', content: aiResponse })
    });

    setMessages(prev => [...prev, { id: Date.now() + 1, conversation_id: currentConv!.id, role: 'assistant' as const, content: aiResponse, created_at: new Date().toISOString() }]);
    setIsLoading(false);
  };

  const handleTTS = async (text: string) => {
    const audioUrl = await generateSpeech(text);
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };
      audio.play();
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica");
    doc.text("MentalHealthGPT Conversation Export", 10, 10);
    let y = 20;
    messages.forEach(m => {
      const text = `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`;
      const splitText = doc.splitTextToSize(text, 180);
      doc.text(splitText, 10, y);
      y += (splitText.length * 7) + 5;
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
    });
    doc.save(`conversation-${activeConversation?.id}.pdf`);
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(messages.map(m => ({
      Role: m.role,
      Content: m.content,
      Time: m.created_at
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Chat History");
    XLSX.writeFile(wb, `conversation-${activeConversation?.id}.xlsx`);
  };

  const deleteConversation = async (id: number) => {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    setConversations(conversations.filter(c => c.id !== id));
    if (activeConversation?.id === id) {
      setActiveConversation(null);
      setMessages([]);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] flex items-center justify-center p-4 font-sans relative overflow-hidden" dir="rtl">
        {/* Serene Mental Health Background */}
        <div className="absolute inset-0 z-0">
          {/* Nature-inspired Gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-teal-50 to-blue-50" />
          
          {/* Animated Breathing Circle (Mindfulness Technique) */}
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <motion.div
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 8, // Average breathing cycle
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="w-[500px] h-[500px] bg-emerald-300 rounded-full blur-[120px]"
            />
          </div>

          {/* Floating Mental Health Icons */}
          {[...Array(30)].map((_, i) => {
            const icons = [Heart, Brain, Smile, Sun, Cloud, Moon, Leaf];
            const colors = [
              'text-red-500/30', 'text-blue-500/30', 'text-yellow-500/30', 
              'text-orange-500/30', 'text-slate-500/30', 'text-indigo-500/30', 
              'text-emerald-500/30', 'text-pink-500/30', 'text-cyan-500/30', 
              'text-green-500/30'
            ];
            const Icon = icons[i % icons.length];
            const color = colors[i % colors.length];
            const left = Math.random() * 100;
            const top = Math.random() * 100;
            
            return (
              <motion.div
                key={`icon-${i}`}
                style={{ 
                  position: 'absolute',
                  left: `${left}%`,
                  top: `${top}%`,
                }}
                initial={{ 
                  opacity: 0,
                  scale: 0.5,
                  rotate: 0
                }}
                animate={{ 
                  opacity: [0.2, 0.6, 0.2],
                  scale: [0.8, 1.2, 0.8],
                  x: [0, Math.random() * 40 - 20, 0],
                  y: [0, Math.random() * 40 - 20, 0],
                  rotate: [0, 15, -15, 0]
                }}
                transition={{
                  duration: 10 + Math.random() * 10,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className={cn("pointer-events-none", color)}
              >
                <Icon size={32 + Math.random() * 32} strokeWidth={1.5} />
              </motion.div>
            );
          })}

          {/* Floating "Thoughts" or "Leaves" */}
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ 
                x: Math.random() * 100 + "%", 
                y: Math.random() * 100 + "%",
                opacity: 0 
              }}
              animate={{ 
                y: [null, "-20%"],
                opacity: [0, 0.4, 0],
                rotate: [0, 45, 90]
              }}
              transition={{
                duration: 10 + Math.random() * 10,
                repeat: Infinity,
                delay: Math.random() * 5,
                ease: "linear"
              }}
              className="absolute w-4 h-4 bg-emerald-400/30 rounded-full blur-sm"
            />
          ))}

          {/* Abstract "Path to Clarity" lines */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
            <motion.path
              d="M-100,500 C200,400 400,600 600,500 S1000,400 1200,500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              animate={{
                d: [
                  "M-100,500 C200,400 400,600 600,500 S1000,400 1200,500",
                  "M-100,520 C220,420 420,620 620,520 S1020,420 1220,520",
                  "M-100,500 C200,400 400,600 600,500 S1000,400 1200,500"
                ]
              }}
              transition={{ duration: 10, repeat: Infinity }}
            />
          </svg>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/70 backdrop-blur-2xl p-8 rounded-[40px] shadow-2xl w-full max-w-md border border-white/40 relative z-10"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-emerald-200">
              <Bot className="text-white w-10 h-10" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">MentalHealthGPT</h1>
            <p className="text-slate-500 text-center">مرحباً بك في مساحتك الآمنة. نحن هنا للاستماع والدعم.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">الاسم</label>
              <input 
                type="text" 
                required
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                placeholder="أدخل اسمك"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">البريد الإلكتروني</label>
              <input 
                type="email" 
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                placeholder="example@mail.com"
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
            >
              دخول
            </button>
          </form>
          
          <div className="mt-6 text-center text-xs text-slate-400">
            بياناتك محمية ومشفرة لضمان خصوصيتك الكاملة.
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-screen bg-[#F8F9FA] text-slate-900 overflow-hidden", language === 'ar' ? 'font-sans' : 'font-sans')} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="bg-white border-l border-slate-200 flex flex-col h-full shadow-sm z-20"
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <Bot className="text-white w-5 h-5" />
                </div>
                <span className="font-bold text-lg">MentalHealthGPT</span>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-4">
              <button 
                onClick={startNewConversation}
                className="w-full flex items-center justify-center gap-2 p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all font-medium border border-emerald-100"
              >
                <Plus className="w-4 h-4" />
                {language === 'ar' ? 'محادثة جديدة' : 'New Chat'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">
                {language === 'ar' ? 'المحادثات السابقة' : 'Recent Chats'}
              </p>
              {conversations.map(conv => (
                <div 
                  key={conv.id}
                  onClick={() => {
                    setActiveConversation(conv);
                    fetchMessages(conv.id);
                    setView('chat');
                  }}
                  className={cn(
                    "group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border border-transparent",
                    activeConversation?.id === conv.id ? "bg-white shadow-md border-slate-100 text-emerald-600" : "hover:bg-slate-50 text-slate-600"
                  )}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Menu className="w-4 h-4 flex-shrink-0 opacity-40" />
                    <span className="truncate text-sm font-medium">{conv.title}</span>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-100 space-y-2">
              <button 
                onClick={() => setView('dashboard')}
                className={cn("w-full flex items-center gap-3 p-3 rounded-xl transition-all", view === 'dashboard' ? "bg-slate-100 text-slate-900" : "hover:bg-slate-50 text-slate-500")}
              >
                <LayoutDashboard className="w-5 h-5" />
                <span className="text-sm font-medium">{language === 'ar' ? 'لوحة التحكم' : 'Dashboard'}</span>
              </button>
              {user.role === 'admin' && (
                <button 
                  onClick={() => setView('admin')}
                  className={cn("w-full flex items-center gap-3 p-3 rounded-xl transition-all", view === 'admin' ? "bg-slate-100 text-slate-900" : "hover:bg-slate-50 text-slate-500")}
                >
                  <Shield className="w-5 h-5" />
                  <span className="text-sm font-medium">{language === 'ar' ? 'الأدمن' : 'Admin'}</span>
                </button>
              )}
              <div className="pt-2 flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold truncate max-w-[100px]">{user.name}</span>
                    <span className="text-[10px] text-slate-400">{user.role}</span>
                  </div>
                </div>
                <button onClick={() => setUser(null)} className="text-slate-400 hover:text-red-500 transition-all">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 z-10 shadow-sm">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
                <Menu className="w-5 h-5" />
              </button>
            )}
            <h2 className="font-bold text-slate-800">
              {view === 'chat' ? (activeConversation?.title || (language === 'ar' ? 'محادثة جديدة' : 'New Chat')) : 
               view === 'dashboard' ? (language === 'ar' ? 'لوحة التحكم' : 'Dashboard') : 
               (language === 'ar' ? 'لوحة الأدمن' : 'Admin Panel')}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
              className="px-3 py-1 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
            >
              {language === 'ar' ? 'English' : 'العربية'}
            </button>
            {view === 'chat' && activeConversation && (
              <div className="flex items-center gap-2">
                <button onClick={exportToPDF} className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-500" title="PDF">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={exportToExcel} className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-500" title="Excel">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto bg-[#F8F9FA]">
          {view === 'chat' && (
            <div className="max-w-4xl mx-auto h-full flex flex-col">
              <div className="flex-1 p-4 lg:p-8 space-y-6">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50 py-20">
                    <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mb-4">
                      <Bot className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h3 className="text-xl font-bold">{language === 'ar' ? 'كيف يمكنني مساعدتك اليوم؟' : 'How can I help you today?'}</h3>
                    <p className="max-w-md text-sm">
                      {language === 'ar' ? 'أنا هنا للاستماع إليك في بيئة آمنة وخاصة. يمكنك التحدث عن أي شيء يقلقك.' : 'I am here to listen in a safe and private environment. You can talk about anything that worries you.'}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-8 w-full max-w-lg">
                      {['أشعر بالتوتر مؤخراً', 'كيف أحسن جودة نومي؟', 'أريد نصائح للتعامل مع القلق', 'تحدث معي عن الإيجابية'].map((hint, i) => (
                        <button 
                          key={i}
                          onClick={() => setInput(hint)}
                          className="p-3 bg-white border border-slate-200 rounded-xl text-sm hover:border-emerald-500 hover:text-emerald-600 transition-all text-right"
                        >
                          {hint}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={m.id} 
                      className={cn("flex gap-4", m.role === 'user' ? "flex-row-reverse" : "flex-row")}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm",
                        m.role === 'user' ? "bg-emerald-500 text-white" : "bg-white text-emerald-500 border border-slate-100"
                      )}>
                        {m.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                      </div>
                      <div className={cn(
                        "max-w-[80%] p-4 rounded-3xl shadow-sm relative group",
                        m.role === 'user' ? "bg-emerald-500 text-white rounded-tr-none" : "bg-white text-slate-800 rounded-tl-none border border-slate-100"
                      )}>
                        <div className="prose prose-sm max-w-none prose-p:leading-relaxed">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                        <div className={cn("mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all", m.role === 'user' ? "justify-end" : "justify-start")}>
                          <button onClick={() => handleTTS(m.content)} className="p-1 hover:bg-black/5 rounded text-[10px] flex items-center gap-1">
                            <Volume2 className="w-3 h-3" />
                            {language === 'ar' ? 'استماع' : 'Listen'}
                          </button>
                          <span className="text-[10px] opacity-40">{formatDate(m.created_at)}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
                {isLoading && (
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-white border border-slate-100 flex items-center justify-center shadow-sm">
                      <Bot className="w-5 h-5 text-emerald-500 animate-pulse" />
                    </div>
                    <div className="bg-white p-4 rounded-3xl rounded-tl-none border border-slate-100 shadow-sm">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 lg:p-8 pt-0">
                <form 
                  onSubmit={handleSendMessage}
                  className="bg-white p-2 rounded-2xl shadow-lg border border-slate-200 flex items-center gap-2"
                >
                  <input 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={language === 'ar' ? 'اكتب رسالتك هنا...' : 'Type your message...'}
                    className="flex-1 p-3 outline-none text-sm bg-transparent"
                    disabled={isLoading}
                  />
                  <button 
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 text-white p-3 rounded-xl transition-all shadow-md shadow-emerald-100"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
                <p className="text-[10px] text-center mt-3 text-slate-400">
                  {language === 'ar' ? 'هذا الشات بوت ليس بديلاً عن العلاج الطبي المتخصص. في حالات الطوارئ، يرجى الاتصال بالخط الساخن المحلي.' : 'This chatbot is not a substitute for professional medical treatment. In emergencies, please contact your local hotline.'}
                </p>
              </div>
            </div>
          )}

          {view === 'dashboard' && (
            <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h4 className="text-slate-400 text-sm font-bold mb-2">{language === 'ar' ? 'إجمالي المحادثات' : 'Total Chats'}</h4>
                  <p className="text-4xl font-black text-slate-900">{conversations.length}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h4 className="text-slate-400 text-sm font-bold mb-2">{language === 'ar' ? 'عضو منذ' : 'Member Since'}</h4>
                  <p className="text-xl font-bold text-slate-900">{formatDate(user.created_at)}</p>
                </div>
                <div className="bg-emerald-500 p-6 rounded-3xl shadow-lg shadow-emerald-100 text-white">
                  <h4 className="text-emerald-100 text-sm font-bold mb-2">{language === 'ar' ? 'الحالة النفسية' : 'Mental Status'}</h4>
                  <p className="text-xl font-bold">{language === 'ar' ? 'مستقرة - واصل التقدم' : 'Stable - Keep going'}</p>
                </div>
              </div>

              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="font-bold text-lg">{language === 'ar' ? 'نصائح صحية مخصصة لك' : 'Personalized Health Tips'}</h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { title: 'التنفس العميق', desc: 'مارس التنفس العميق لمدة 5 دقائق يومياً لتقليل التوتر.' },
                    { title: 'الامتنان', desc: 'اكتب 3 أشياء تشعر بالامتنان تجاهها قبل النوم.' },
                    { title: 'النشاط البدني', desc: 'المشي لمدة 20 دقيقة يحسن الحالة المزاجية بشكل ملحوظ.' },
                    { title: 'النوم المنتظم', desc: 'حاول النوم والاستيقاظ في نفس الموعد يومياً.' }
                  ].map((tip, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <h5 className="font-bold text-emerald-600 mb-1">{tip.title}</h5>
                      <p className="text-sm text-slate-600">{tip.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === 'admin' && user.role === 'admin' && (
            <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h4 className="text-slate-400 text-sm font-bold mb-2">المستخدمين</h4>
                  <p className="text-3xl font-black">{adminStats?.userCount || 0}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h4 className="text-slate-400 text-sm font-bold mb-2">المحادثات</h4>
                  <p className="text-3xl font-black">{adminStats?.conversationCount || 0}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h4 className="text-slate-400 text-sm font-bold mb-2">الرسائل</h4>
                  <p className="text-3xl font-black">{adminStats?.messageCount || 0}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h4 className="text-slate-400 text-sm font-bold mb-2">معدل الاستخدام</h4>
                  <p className="text-3xl font-black">نشط</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold">قائمة المستخدمين</h3>
                    <button onClick={fetchAdminData} className="text-xs text-emerald-500 font-bold">تحديث</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="bg-slate-50 text-slate-400">
                        <tr>
                          <th className="p-4">الاسم</th>
                          <th className="p-4">البريد</th>
                          <th className="p-4">الدور</th>
                          <th className="p-4">التاريخ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map(u => (
                          <tr key={u.id} className="border-t border-slate-50 hover:bg-slate-50 transition-all">
                            <td className="p-4 font-medium">{u.name}</td>
                            <td className="p-4 text-slate-500">{u.email}</td>
                            <td className="p-4">
                              <span className={cn("px-2 py-1 rounded-lg text-[10px] font-bold", u.role === 'admin' ? "bg-purple-100 text-purple-600" : "bg-emerald-100 text-emerald-600")}>
                                {u.role}
                              </span>
                            </td>
                            <td className="p-4 text-slate-400 text-xs">{formatDate(u.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-6 border-b border-slate-100">
                    <h3 className="font-bold">آخر المحادثات</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="bg-slate-50 text-slate-400">
                        <tr>
                          <th className="p-4">العنوان</th>
                          <th className="p-4">المستخدم</th>
                          <th className="p-4">التاريخ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminConvs.map(c => (
                          <tr key={c.id} className="border-t border-slate-50 hover:bg-slate-50 transition-all">
                            <td className="p-4 font-medium truncate max-w-[150px]">{c.title}</td>
                            <td className="p-4 text-slate-500">{c.user_email}</td>
                            <td className="p-4 text-slate-400 text-xs">{formatDate(c.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
