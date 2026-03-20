import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Upload, FileText, ChevronRight, Sun, Moon, 
  Send, Trash2, X, Info, CheckCircle2, AlertCircle, 
  Loader2, LogOut, User as UserIcon, MessageSquare 
} from 'lucide-react';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider, AI_CONFIG } from './lib/firebase/config';
import { extractText, createChunks } from './lib/rag/DocumentProcessor';
import { generateEmbedding, storeChunks, similaritySearch } from './lib/rag/VectorStore';
import { getAIResponse } from './lib/api/openRouter';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hello! I am your **AUREX Support AI**. I am here to help answer questions based strictly on the documents you upload.' },
    { role: 'ai', text: 'Please upload a PDF, DOCX, or TXT file using the sidebar to get started.' }
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [sources, setSources] = useState([]);
  const [showSourcePanel, setShowSourcePanel] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  // Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const showStatus = (text, type = 'info') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showStatus("Signed in successfully", "success");
    } catch (error) {
      showStatus("Auth failed: " + error.message, "error");
    }
  };

  const handleLogout = () => signOut(auth);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    showStatus(`Processing ${file.name}...`, 'info');

    try {
      const text = await extractText(file);
      const docId = `doc-${Date.now()}`;
      const chunks = createChunks(text, docId);
      
      showStatus("Generating embeddings...", "info");
      
      const chunksWithEmbeds = await Promise.all(chunks.map(async (chunk) => ({
        ...chunk,
        embedding: await generateEmbedding(chunk.text, AI_CONFIG.HF_KEY)
      })));

      await storeChunks(chunksWithEmbeds);
      
      setDocuments(prev => [...prev, { id: docId, name: file.name, chunkCount: chunks.length }]);
      showStatus(`${file.name} indexed successfully!`, 'success');
    } catch (error) {
      console.error(error);
      showStatus("Upload failed: " + error.message, 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAsk = async () => {
    if (!input.trim()) return;

    const query = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: query }]);
    setIsThinking(true);

    try {
      let relevantChunks = [];
      
      // Mode Switching Logic
      if (documents.length > 0) {
        console.log("Mode: RAG (Documents detected)");
        const queryEmbedding = await generateEmbedding(query, AI_CONFIG.HF_KEY);
        relevantChunks = await similaritySearch(queryEmbedding, 0.7);
        console.log("Retrieved Chunks:", relevantChunks);
      } else {
        console.log("Mode: General (No documents)");
      }

      const aiResponse = await getAIResponse(query, relevantChunks, AI_CONFIG.OPENROUTER_KEY);
      setMessages(prev => [...prev, { role: 'ai', text: aiResponse }]);
      
      if (relevantChunks.length > 0) {
        setSources(relevantChunks);
        setShowSourcePanel(true);
      } else {
        setSources([]);
      }
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: error.message || "I’m having trouble connecting right now. Please try again in a moment." 
      }]);
      showStatus(error.message, 'error');
    } finally {
      setIsThinking(false);
    }
  };

  // Theme Constants
  const theme = {
    bg: isDarkMode ? 'bg-premium-black' : 'bg-[#F9FAFB]',
    panel: isDarkMode ? 'bg-premium-dark' : 'bg-white',
    sidebar: isDarkMode ? 'bg-premium-dark' : 'bg-white',
    text: isDarkMode ? 'text-white' : 'text-[#111827]',
    textSecondary: isDarkMode ? 'text-gray-400' : 'text-[#6B7280]',
    border: isDarkMode ? 'border-premium-gray/50' : 'border-[#E5E7EB]',
    bubbleUser: 'bg-gold text-black',
    bubbleAI: isDarkMode ? 'bg-premium-gray/40 border border-white/5 text-gray-200' : 'bg-white border-[#E5E7EB] border text-[#111827]',
    inputBg: isDarkMode ? 'bg-premium-dark' : 'bg-white',
  };

  return (
    <div className={`min-h-screen ${theme.bg} ${theme.text} font-inter flex overflow-hidden antialiased`}>
      
      {/* Sidebar */}
      <aside className={`w-80 border-r ${theme.border} flex flex-col shrink-0 h-screen p-6 ${theme.sidebar} transition-all z-20`}>
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-gold rounded-xl flex items-center justify-center shadow-lg shadow-gold/30 rotate-3">
            <Shield className="text-black w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-black tracking-tight leading-none italic">
              AUREX <span className="text-gold">SUPPORT</span>
            </h1>
            <span className="text-[10px] uppercase tracking-[0.3em] font-bold opacity-50">Enterprise AI</span>
          </div>
        </div>

        {/* User Auth Section */}
        <div className="mb-8">
          {!user ? (
            <button 
              onClick={handleLogin}
              className={`w-full flex items-center justify-center gap-3 p-4 rounded-xl text-sm font-bold transition-all border ${
                isDarkMode ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white border-[#E5E7EB] hover:bg-gray-50 shadow-sm'
              }`}
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/pwa/google.svg" className="w-4 h-4" alt="Google" />
              <span>Sign in with Google</span>
            </button>
          ) : (
            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-gold/5 border-gold/20' : 'bg-gold/5 border-gold/10'} flex items-center gap-3 group relative`}>
              <div className="w-10 h-10 rounded-full border-2 border-gold p-0.5 overflow-hidden">
                {user.photoURL ? <img src={user.photoURL} alt="User" /> : <UserIcon className="w-full h-full p-1 opacity-50" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{user.displayName || 'User'}</p>
                <button onClick={handleLogout} className="text-[9px] uppercase tracking-widest text-gold hover:underline">Log Out</button>
              </div>
              <div className="absolute top-2 right-2 flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar no-scrollbar">
          <div>
            <h3 className={`text-[10px] font-bold uppercase tracking-widest ${theme.textSecondary} mb-4 px-2`}>Knowledge Engine</h3>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
              accept=".pdf,.docx,.txt"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className={`w-full group flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed transition-all text-sm font-semibold cursor-pointer ${
                isDarkMode 
                ? 'border-premium-gray/50 text-gray-400 hover:border-gold hover:bg-gold/5 hover:text-white' 
                : 'border-[#E5E7EB] text-[#6B7280] hover:border-gold hover:bg-gold/5 hover:text-[#111827]'
              } disabled:opacity-50`}
            >
              <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'} group-hover:bg-gold transition-colors`}>
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin text-gold group-hover:text-black" /> : <Upload className="w-4 h-4 group-hover:text-black" />}
              </div>
              <div className="flex flex-col items-start translate-y-0.5">
                <span className="text-xs">{isUploading ? 'Analyzing...' : 'Upload Document'}</span>
                <span className="text-[9px] opacity-40 font-bold uppercase tracking-tighter">PDF, DOCX, TXT</span>
              </div>
            </button>
            
            <div className="mt-6 space-y-2">
              {documents.map(doc => (
                <div key={doc.id} className={`flex items-center gap-3 p-3 rounded-xl border animate-in slide-in-from-left-2 ${
                  isDarkMode ? 'bg-premium-gray/30 border-white/5' : 'bg-gray-50 border-[#E5E7EB]'
                } group`}>
                  <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold truncate">{doc.name}</p>
                    <p className="text-[9px] opacity-40 font-mono tracking-tighter uppercase">{doc.chunkCount} Units Indexed</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {documents.length > 0 && (
            <div className="animate-in fade-in duration-500">
              <h3 className={`text-[10px] font-bold uppercase tracking-widest ${theme.textSecondary} mb-4 px-2`}>Maintenance</h3>
              <button 
                onClick={() => { setMessages([]); setSources([]); setDocuments([]); }}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors text-sm font-bold border underline decoration-gold/30 hover:decoration-gold ${
                  isDarkMode ? 'bg-red-500/5 border-red-500/10 text-red-400 hover:bg-red-500/10' : 'bg-red-50/50 border-red-100 text-red-500 hover:bg-red-100'
                }`}
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>Format System Cache</span>
              </button>
            </div>
          )}
        </div>

        <div className={`mt-auto pt-6 border-t ${theme.border}`}>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all shadow-sm ${
              isDarkMode ? 'bg-white/5 border border-white/5 text-gray-400' : 'bg-gray-100/50 border border-gray-200 text-[#111827]'
            }`}
          >
            <div className="flex items-center gap-2">
              {isDarkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              <span className="text-xs font-black uppercase tracking-widest whitespace-nowrap">{isDarkMode ? 'Midnight Engine' : 'Surface mode'}</span>
            </div>
            <div className={`w-10 h-6 rounded-full p-1 transition-colors relative ${isDarkMode ? 'bg-gold' : 'bg-gray-300'}`}>
              <div className={`w-4 h-4 bg-white rounded-full transition-all shadow-md ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen relative min-w-0 z-10">
        
        {/* Status Toast */}
        {statusMessage && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4">
            <div className={`flex items-center gap-3 px-8 py-4 rounded-2xl shadow-2xl border backdrop-blur-3xl ${
              statusMessage.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
              statusMessage.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
              'bg-gold/10 border-gold/20 text-gold'
            }`}>
              {statusMessage.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
              {statusMessage.type === 'error' && <AlertCircle className="w-5 h-5" />}
              {statusMessage.type === 'info' && <Info className="w-5 h-5" />}
              <span className="text-[13px] font-black tracking-tight">{statusMessage.text}</span>
            </div>
          </div>
        )}

        <header className={`h-24 border-b ${theme.border} flex items-center justify-between px-10 ${theme.panel}/80 backdrop-blur-2xl shrink-0`}>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${documents.length > 0 ? 'bg-green-500' : 'bg-gray-500'} animate-pulse`} />
            <div className="flex flex-col">
              <span className={`uppercase tracking-widest text-[10px] font-black ${theme.textSecondary}`}>RAG Network Status</span>
              <span className="text-xs font-bold leading-none">{documents.length > 0 ? `${documents.length} Core Repositories Active` : 'Awaiting Knowledge Injection'}</span>
            </div>
          </div>
          <button 
            onClick={() => setShowSourcePanel(!showSourcePanel)}
            className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest ${
              showSourcePanel 
              ? 'bg-gold text-black shadow-lg shadow-gold/20' 
              : `${isDarkMode ? 'bg-white/5 border-white/5 text-gray-500' : 'bg-white border-[#E5E7EB] text-[#6B7280] shadow-sm'} border`
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Sources {sources.length > 0 && `[${sources.length}]`}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-12 space-y-10 scroll-smooth custom-scrollbar no-scrollbar">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'ai' && (
                <div className={`w-10 h-10 rounded-2xl ${isDarkMode ? 'bg-gold/10 border-gold/20' : 'bg-gold/5 border-gold/10'} border flex items-center justify-center shrink-0 mt-1 shadow-xl`}>
                  <Shield className="w-5 h-5 text-gold" />
                </div>
              )}
              <div className={`space-y-3 max-w-2xl ${msg.role === 'user' ? 'order-1' : 'order-2'}`}>
                <div className={`p-6 rounded-[24px] text-[15px] leading-[1.7] shadow-xl ${
                  msg.role === 'user' 
                  ? 'bg-gold text-black font-semibold rounded-tr-sm' 
                  : `${theme.bubbleAI} rounded-tl-sm`
                }`}>
                  {msg.text.split('\n').map((line, i) => (
                    <p key={i} className={`${i > 0 ? 'mt-4' : ''} ${msg.role === 'ai' && line.startsWith('[Source') ? 'text-[11px] opacity-40 font-mono mt-2' : ''}`}>
                      {line}
                    </p>
                  ))}
                </div>
                {msg.role === 'ai' && idx === messages.length - 1 && sources.length > 0 && (
                  <button 
                    onClick={() => setShowSourcePanel(true)}
                    className="text-[10px] font-black text-gold uppercase tracking-[0.2em] flex items-center gap-2 hover:opacity-70 ml-2 transition-opacity"
                  >
                    Analysis Complete • View Trace <ChevronRight className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-10 h-10 rounded-2xl bg-premium-gray/10 border border-white/5 flex items-center justify-center shrink-0 mt-1 shadow-lg overflow-hidden">
                  {user?.photoURL ? <img src={user.photoURL} alt="U" /> : <div className="text-xs font-bold font-mono opacity-30">USR</div>}
                </div>
              )}
            </div>
          ))}
          {isThinking && (
            <div className="flex gap-6 animate-in fade-in">
              <div className="w-10 h-10 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0 shadow-lg">
                <Loader2 className="w-5 h-5 text-gold animate-spin" />
              </div>
              <div className={`px-8 py-5 rounded-[24px] rounded-tl-sm text-[11px] font-bold uppercase tracking-widest italic opacity-50 border border-dashed ${theme.border}`}>
                Aurex Retrieval Engine in progress...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Floating Input Area */}
        <div className="p-12 pt-4 relative z-30">
          <div className="max-w-4xl mx-auto relative group">
            <div className={`absolute -inset-1 bg-gradient-to-r from-gold to-gold-dark rounded-[24px] blur opacity-0 group-focus-within:opacity-10 transition-all duration-700`} />
            <div className={`relative ${theme.inputBg} border-2 ${theme.border} focus-within:border-gold/50 rounded-[24px] overflow-hidden transition-all shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex items-center p-3 gap-2`}>
              <div className="flex-1 flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl border ${theme.border} flex items-center justify-center shrink-0`}>
                  <Shield className="w-5 h-5 text-gold/30" />
                </div>
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAsk()}
                  placeholder={documents.length > 0 ? "Ask anything..." : "Please initialize the knowledge core first"}
                  className={`flex-1 bg-transparent border-none outline-none py-4 px-2 text-[16px] font-medium leading-none tracking-tight ${theme.text} placeholder-gray-500/50 cursor-text`}
                  style={{ pointerEvents: 'auto' }}
                />
              </div>
              <button 
                onClick={handleAsk}
                className="bg-gold hover:bg-gold-dark text-black font-black uppercase tracking-tighter py-4 px-10 rounded-xl transition-all hover:scale-[1.03] active:scale-95 shadow-xl shadow-gold/20 flex items-center gap-3 shrink-0 group/btn"
                style={{ pointerEvents: 'auto' }}
              >
                {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />}
                <span className="text-sm">Ask Aurex</span>
              </button>
            </div>
            <div className="flex justify-center items-center px-10 mt-6 gap-8">
              <span className="text-[9px] text-gray-500 uppercase tracking-widest font-black flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-gold" /> STRICT CONTEXT ONLY
              </span>
              <span className="text-[9px] text-gray-500 uppercase tracking-widest font-black flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-gold" /> ZERO HALLUCINATION
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Right Source Panel */}
      <aside className={`${showSourcePanel ? 'w-[450px] border-l' : 'w-0'} flex flex-col shrink-0 h-screen transition-all duration-700 ease-in-out ${theme.border} ${theme.sidebar} backdrop-blur-3xl overflow-hidden z-20`}>
        <div className="p-10 flex flex-col h-full min-w-[450px]">
          <div className="flex items-center justify-between mb-12">
            <div className="flex flex-col">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gold">Analysis Trace</h3>
              <span className={`text-[11px] font-bold ${theme.textSecondary}`}>Semantic Source Clusters</span>
            </div>
            <button onClick={() => setShowSourcePanel(false)} className={`p-3 ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-100'} rounded-xl transition-all`}>
              <X className="w-5 h-5 opacity-40" />
            </button>
          </div>
          
          {sources.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-10 gap-6">
              <div className="p-10 rounded-full border-2 border-dashed border-gray-500">
                <FileText className="w-16 h-16" />
              </div>
              <p className="text-xs uppercase tracking-[0.4em] font-black">Memory Empty</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar no-scrollbar">
              {sources.map((source, i) => (
                <div key={i} className="group animate-in slide-in-from-right-8 duration-500" style={{ animationDelay: `${i * 150}ms` }}>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-gold" />
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Cluster {i + 1}</span>
                    </div>
                    <span className="text-[10px] font-black font-mono text-gold/80 bg-gold/5 px-2 py-0.5 rounded-full">{(source.score * 100).toFixed(1)}% Match</span>
                  </div>
                  <div className={`p-6 rounded-[24px] border transition-all relative ${
                    isDarkMode 
                    ? 'bg-premium-gray/20 border-white/5 group-hover:border-gold/30' 
                    : 'bg-gray-50 border-[#E5E7EB] group-hover:border-gold/40 shadow-sm'
                  }`}>
                    <div className="absolute -left-1 top-6 w-2 h-6 bg-gold/30 rounded-full blur-sm group-hover:bg-gold transition-all" />
                    <p className={`text-[13px] leading-[1.8] italic ${isDarkMode ? 'text-gray-400' : 'text-[#6B7280]'} group-hover:text-gold/90 transition-colors`}>
                      "{source.text}"
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export default App;
