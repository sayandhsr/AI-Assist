import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Upload, FileText, ChevronRight, Sun, Moon, 
  Send, Trash2, X, Info, CheckCircle2, AlertCircle, 
  Loader2, LogOut, User as UserIcon, MessageSquare,
  Menu, Copy, Check, ExternalLink, RefreshCcw, Plus,
  FolderOpen, ChevronLeft, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider, AI_CONFIG } from './lib/firebase/config';
import { callAI } from './lib/api/openRouter';
import { saveMessageToFirestore, loadMessagesFromFirestore, clearFirestoreMessages } from './lib/firebase/store';
import { extractText, createChunks } from './lib/rag/DocumentProcessor';
import { generateEmbedding, storeChunks, similaritySearch, deleteDocumentChunks } from './lib/rag/VectorStore';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [user, setUser] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile Drawer
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false); // Desktop Collapse
  
  // Project Management State
  const [projects, setProjects] = useState([
    { 
      id: 'default', 
      name: 'Initial Session', 
      messages: [
        { id: '1', role: 'ai', text: 'Hello! I am your **AUREX Support AI**. I am here to help answer your questions.' },
        { id: '2', role: 'ai', text: 'You can chat with me normally, or upload a document in the sidebar for precise, context-based answers.' }
      ], 
      documents: [] 
    }
  ]);
  const [activeProjectId, setActiveProjectId] = useState('default');
  
  // UI Transient State
  const [input, setInput] = useState(''); // UI State
  const [statusMessage, setStatusMessage] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showSourcePanel, setShowSourcePanel] = useState(false);
  const [sources, setSources] = useState([]);
  const [lastCopiedId, setLastCopiedId] = useState(null);
  const fileInputRef = useRef(null);
  
  // Smart Scroll Refs
  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isUserScrollingRef = useRef(false);

  const hasLoaded = useRef(false);
  const saveTimerRef = useRef(null);

  // Derived Active Project data
  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0];
  const messages = activeProject.messages;
  const documents = activeProject.documents;

  const suggestedQuestions = [
    "Summarize the key points",
    "Identify important dates",
    "What are the main requirements?",
    "Explain the warranty policy"
  ];

  // === PERSISTENCE LAYER ===

  // Step 1: Load from localStorage immediately (fast boot for guests)
  useEffect(() => {
    const savedSidebar = localStorage.getItem('aurex_sidebar_collapsed');
    if (savedSidebar) setIsSidebarCollapsed(JSON.parse(savedSidebar));

    const savedProjects = localStorage.getItem('aurex_projects_v2');
    const savedActiveId = localStorage.getItem('aurex_active_id_v2');
    if (savedProjects) {
      try {
        const parsed = JSON.parse(savedProjects);
        if (parsed.length > 0) setProjects(parsed);
      } catch (e) { /* ignore */ }
    }
    if (savedActiveId) setActiveProjectId(savedActiveId);
    hasLoaded.current = true;
  }, []);

  // Step 2: On auth change → load chat from Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // LOAD CHAT FROM FIRESTORE
        console.log("Auth: User logged in, loading Firestore messages...");
        const firestoreMessages = await loadMessagesFromFirestore(currentUser.uid);
        if (firestoreMessages.length > 0) {
          // Replace the active project's messages with Firestore data
          setProjects(prev => prev.map((p, i) => {
            if (i === 0 || p.id === (prev.find(x => x.id === activeProjectId)?.id)) {
              return { ...p, messages: firestoreMessages };
            }
            return p;
          }));
          showStatus('Chat history restored ✓', 'success');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Step 3: Always save to localStorage as fallback
  useEffect(() => {
    if (!hasLoaded.current) return;
    try {
      localStorage.setItem('aurex_projects_v2', JSON.stringify(projects));
      localStorage.setItem('aurex_active_id_v2', activeProjectId);
      localStorage.setItem('aurex_sidebar_collapsed', JSON.stringify(isSidebarCollapsed));
    } catch (e) { /* quota exceeded, ignore */ }
  }, [projects, activeProjectId, isSidebarCollapsed]);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    // If the user scrolls up more than 100px from the bottom, they are reading history
    isUserScrollingRef.current = distanceToBottom > 100;
  };

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    const isUserMessage = lastMessage?.role === 'user';
    
    // Auto-scroll if user is already at the bottom, OR if they just sent a new message
    if (!isUserScrollingRef.current || isUserMessage) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking]);

  // Project Actions
  const createNewProject = () => {
    const id = Date.now().toString();
    const newProject = {
      id,
      name: `Project ${projects.length + 1}`,
      messages: [
        { id: '1', role: 'ai', text: 'New Project Initialized. How can I assist you with your data today?' }
      ],
      documents: []
    };
    setProjects(prev => [...prev, newProject]);
    setActiveProjectId(id);
    showStatus("New project created", "success");
    setIsSidebarOpen(false);
  };

  const deleteProject = (id, e) => {
    e.stopPropagation();
    if (projects.length === 1) {
      showStatus("Cannot delete the only project", "error");
      return;
    }
    const newProjects = projects.filter(p => p.id !== id);
    setProjects(newProjects);
    if (activeProjectId === id) {
      setActiveProjectId(newProjects[0].id);
    }
    showStatus("Project deleted", "info");
  };

  const updateCurrentProject = (updateFn) => {
    setProjects(prev => prev.map(p => {
      if (p.id === activeProjectId) {
        return updateFn(p);
      }
      return p;
    }));
  };

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
      
      const newDoc = { id: docId, name: file.name, chunkCount: chunks.length };
      updateCurrentProject(p => ({
        ...p,
        documents: [...p.documents, newDoc]
      }));
      showStatus(`${file.name} indexed successfully!`, 'success');
    } catch (error) {
      console.error(error);
      showStatus("Upload failed: " + error.message, 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveDocument = async (docId, e) => {
    e.stopPropagation();
    try {
      await deleteDocumentChunks(docId);
      updateCurrentProject(p => ({
        ...p,
        documents: p.documents.filter(d => d.id !== docId)
      }));
      showStatus("Document deleted", "info");
    } catch (err) {
      console.error(err);
      showStatus("Failed to delete document", "error");
    }
  };

  const handleClearChat = async () => {
    if (confirm("Are you sure you want to clear this entire chat?")) {
      updateCurrentProject(p => ({ ...p, messages: [] }));
      if (user?.uid) {
        await clearFirestoreMessages(user.uid, activeProjectId);
      }
      showStatus("Chat messages cleared", "info");
    }
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setLastCopiedId(id);
    setTimeout(() => setLastCopiedId(null), 2000);
    showStatus("Copied to clipboard", "success");
  };

  const handleAsk = async (explicitText = null) => {
    const textToProcess = explicitText || input;
    if (!textToProcess.trim() || isThinking) return;

    const query = textToProcess.trim();
    console.log("SENDING QUERY:", query);
    
    // Small Talk Detection
    const smallTalkKeywords = ['hello', 'hi', 'hey', 'thanks', 'thank you', 'thank u', 'bye', 'good morning', 'good evening'];
    const isSmallTalk = smallTalkKeywords.some(kw => query.toLowerCase().includes(kw)) && query.split(' ').length < 4;

    setInput('');
    const userMsgId = Date.now().toString();
    
    // 1) Add user message to UI
    updateCurrentProject(p => ({
      ...p,
      messages: [...p.messages, { id: userMsgId, role: 'user', text: query }]
    }));

    // 2) SAVE USER MESSAGE TO FIRESTORE
    if (user?.uid) {
      saveMessageToFirestore(user.uid, 'user', query);
    }
    
    setIsThinking(true);

    try {
      let context = "";
      
      if (documents.length > 0 && !isSmallTalk) {
        console.log("Mode: RAG (Documents detected)");
        const queryEmbedding = await generateEmbedding(query, AI_CONFIG.HF_KEY);
        // Pass the valid document IDs to filter similarity search
        const validDocIds = documents.map(d => d.id);
        const relevantChunks = await similaritySearch(queryEmbedding, 0.4, validDocIds); 
        
        if (relevantChunks.length > 0) {
          context = relevantChunks.map(c => c.text).join("\n\n");
          setSources(relevantChunks);
          if (window.innerWidth > 1024) setShowSourcePanel(true);
        } else {
          setSources([]);
          context = "[NO RELEVANT INFO]"; // Enforce strict failure rather than generic hallucination
        }
      }

      console.log("Calling OpenRouter...");
      const aiResponse = await callAI(query, context);
      
      // 3) Add AI response to UI
      updateCurrentProject(p => ({
        ...p,
        messages: [...p.messages, { id: (Date.now() + 1).toString(), role: 'ai', text: aiResponse }]
      }));

      // 4) SAVE AI MESSAGE TO FIRESTORE
      if (user?.uid) {
        saveMessageToFirestore(user.uid, 'ai', aiResponse);
      }

    } catch (error) {
      console.error("AI ERROR:", error);
      const errText = error.message || "I'm having trouble connecting right now. Please try again in a moment.";
      updateCurrentProject(p => ({
        ...p,
        messages: [...p.messages, { id: (Date.now() + 1).toString(), role: 'ai', text: errText }]
      }));
      // Save error response to Firestore too
      if (user?.uid) {
        saveMessageToFirestore(user.uid, 'ai', errText);
      }
    } finally {
      setIsThinking(false);
    }
  };

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
    <div className={`min-h-screen ${theme.bg} ${theme.text} font-inter flex flex-col md:flex-row overflow-hidden antialiased`}>
      
      {/* Mobile Top Header */}
      <div className={`md:hidden flex items-center justify-between p-4 border-b ${theme.border} ${theme.panel}/80 backdrop-blur-xl z-50`}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gold rounded-lg flex items-center justify-center shadow-lg shadow-gold/20">
            <Shield className="text-black w-5 h-5" />
          </div>
          <span className="font-black italic text-sm">AUREX <span className="text-gold">SUPPORT</span></span>
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-3 active:scale-95 transition-transform">
          {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {!isSidebarCollapsed || isSidebarOpen ? (
          <motion.aside 
            initial={window.innerWidth > 768 ? { width: 0, opacity: 0 } : { x: -320 }}
            animate={window.innerWidth > 768 ? { width: 320, opacity: 1 } : { x: 0 }}
            exit={window.innerWidth > 768 ? { width: 0, opacity: 0 } : { x: -320 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`
              fixed md:relative inset-y-0 left-0 w-80 border-r ${theme.border} flex flex-col shrink-0 h-full p-6 ${theme.sidebar} 
              z-50 overflow-hidden
            `}
          >
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gold rounded-xl flex items-center justify-center shadow-lg shadow-gold/30 rotate-3">
                  <Shield className="text-black w-6 h-6" />
                </div>
                <div className="flex flex-col">
                  <h1 className="text-lg font-black tracking-tight leading-none italic">
                    AUREX <span className="text-gold">SUPPORT</span>
                  </h1>
                </div>
              </div>
              <button 
                onClick={() => setIsSidebarCollapsed(true)} 
                className="hidden md:flex p-2 hover:bg-white/10 rounded-lg transition-all text-gold opacity-50 hover:opacity-100"
              >
                <PanelLeftClose className="w-5 h-5" />
              </button>
            </div>

            {/* User Auth Section */}
            <div className="mb-8">
              {!user ? (
                <button 
                  onClick={handleLogin}
                  className={`w-full group flex items-center justify-center gap-4 p-4 rounded-2xl text-sm font-bold transition-all border ${
                    isDarkMode 
                    ? 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-gold/30' 
                    : 'bg-white border-[#E5E7EB] hover:bg-gray-50 shadow-sm'
                  }`}
                >
                  <div className="bg-white p-1.5 rounded-full shadow-sm">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/pwa/google.svg" className="w-5 h-5" alt="Google" />
                  </div>
                  <span>Sign in with Google</span>
                </button>
              ) : (
                <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-gold/5 border-gold/20' : 'bg-gold/5 border-gold/10'} flex items-center gap-3 relative overflow-hidden`}>
                  <div className="w-10 h-10 rounded-full border-2 border-gold p-0.5 overflow-hidden">
                    {user.photoURL ? <img src={user.photoURL} alt="User" /> : <UserIcon className="w-full h-full p-1 opacity-50" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{user.displayName || 'User'}</p>
                    <button onClick={handleLogout} className="text-[9px] uppercase tracking-widest text-gold hover:underline font-black">Disconnect</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
              {/* Projects Section */}
              <div>
                <div className="flex items-center justify-between mb-4 px-2">
                  <h3 className={`text-[10px] font-black uppercase tracking-widest ${theme.textSecondary}`}>My Projects</h3>
                  <button onClick={createNewProject} className="p-1 hover:bg-gold/10 rounded-md transition-all text-gold">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {projects.map(project => (
                    <div 
                      key={project.id}
                      onClick={() => { setActiveProjectId(project.id); (window.innerWidth < 768) && setIsSidebarOpen(false); }}
                      className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer border transition-all ${
                        activeProjectId === project.id 
                        ? 'bg-gold/10 border-gold/30 text-gold' 
                        : `border-transparent hover:bg-white/5 ${theme.textSecondary}`
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FolderOpen className={`w-4 h-4 shrink-0 ${activeProjectId === project.id ? 'text-gold' : 'opacity-40'}`} />
                        <span className="text-xs font-bold truncate">{project.name}</span>
                      </div>
                      <button onClick={(e) => deleteProject(project.id, e)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Knowledge Core Section */}
              <div>
                <h3 className={`text-[10px] font-black uppercase tracking-widest ${theme.textSecondary} mb-4 px-2`}>Knowledge Core</h3>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,.docx,.txt" />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full group flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed transition-all text-sm font-semibold ${
                    isDarkMode 
                    ? 'border-premium-gray/50 text-gray-400 hover:border-gold hover:bg-gold/5' 
                    : 'border-[#E5E7EB] text-[#6B7280] hover:border-gold hover:bg-gold/5'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'} group-hover:bg-gold transition-colors`}>
                    {isUploading ? <Loader2 className="w-5 h-5 animate-spin text-gold group-hover:text-black" /> : <Upload className="w-5 h-5 group-hover:text-black" />}
                  </div>
                  <div className="flex-1 flex flex-col items-start min-w-0">
                    <span className="text-xs font-black truncate w-full uppercase">{isUploading ? 'Ingesting...' : 'Add Feed'}</span>
                  </div>
                </button>
                
                <div className="mt-6 space-y-3">
                  {documents.map(doc => (
                    <div key={doc.id} className={`group flex items-center justify-between p-4 rounded-2xl border ${isDarkMode ? 'bg-premium-gray/30 border-white/5' : 'bg-gray-50 border-[#E5E7EB] shadow-sm'}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-gold shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black truncate">{doc.name}</p>
                          <p className="text-[9px] opacity-40 font-mono tracking-tighter uppercase font-bold">{doc.chunkCount} Nodes</p>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => handleRemoveDocument(doc.id, e)}
                        className={`p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${isDarkMode ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-100 text-red-500'}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={`mt-auto pt-6 border-t ${theme.border}`}>
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all shadow-sm ${
                  isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-100/50 text-[#111827]'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isDarkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none">{isDarkMode ? 'Night' : 'Day'}</span>
                </div>
                <div className={`w-10 h-6 rounded-full p-1 transition-colors relative ${isDarkMode ? 'bg-gold' : 'bg-gray-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-all shadow-md ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              </button>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0 relative z-10 overflow-hidden">
        
        {/* Floating Toggle Button (Visible when sidebar collapsed) */}
        {isSidebarCollapsed && (
          <motion.button 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => setIsSidebarCollapsed(false)}
            className={`hidden md:flex fixed top-10 left-6 z-[60] p-3 rounded-xl border ${theme.border} ${theme.panel} shadow-2xl hover:bg-gold hover:text-black transition-all group`}
          >
            <PanelLeftOpen className="w-5 h-5" />
            <span className="absolute left-14 bg-black text-white text-[10px] font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">Open Panel</span>
          </motion.button>
        )}

        {/* Status Toast */}
        <AnimatePresence>
          {statusMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -20, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: -20, x: '-50%' }}
              className="fixed top-6 left-1/2 z-[100] w-[90%] md:w-auto"
            >
              <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-3xl ${
                statusMessage.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                statusMessage.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                'bg-gold/10 border-gold/20 text-gold'
              }`}>
                {statusMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
                {statusMessage.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                {statusMessage.type === 'info' && <Info className="w-5 h-5 flex-shrink-0" />}
                <span className="text-xs font-black tracking-tight uppercase">{statusMessage.text}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <header className={`h-24 border-b ${theme.border} flex items-center justify-between px-6 md:px-10 ${theme.panel}/80 backdrop-blur-2xl shrink-0 z-30`}>
          <div className="flex items-center gap-4 max-w-[50%]">
            <div className={`w-3 h-3 rounded-full ${documents.length > 0 ? 'bg-green-500 shadow-green-500/40' : 'bg-gray-500'} shadow-lg animate-pulse`} />
            <div className="flex flex-col min-w-0">
              <span className={`uppercase tracking-[0.2em] text-[9px] font-black ${theme.textSecondary} truncate`}>{activeProject.name}</span>
              <span className="text-xs font-black leading-none">{documents.length > 0 ? 'NEURAL LINK' : 'GENERAL AI'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleClearChat}
              className={`hidden sm:flex items-center gap-2 px-4 py-4 rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest ${isDarkMode ? 'bg-white/5 border-white/5 text-gray-400 hover:text-red-400 hover:bg-red-500/10' : 'bg-white border-[#E5E7EB] text-[#6B7280] shadow-sm hover:text-red-500 hover:bg-red-50'} border`}
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear</span>
            </button>
            <button 
              onClick={() => setShowSourcePanel(!showSourcePanel)}
              className={`flex items-center gap-2 px-6 py-4 rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest ${
                showSourcePanel 
                ? 'bg-gold text-black shadow-lg shadow-gold/40' 
                : `${isDarkMode ? 'bg-white/5 border-white/5 text-gray-400' : 'bg-white border-[#E5E7EB] text-[#6B7280] shadow-sm'} border`
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Inspect Trace</span>
              {sources.length > 0 && <span className="bg-current/10 px-2 rounded-lg ml-1">{sources.length}</span>}
            </button>
          </div>
        </header>

        <div 
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 md:p-12 space-y-10 scroll-smooth custom-scrollbar no-scrollbar relative"
        >
          {messages.map((msg, idx) => (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              key={msg.id} 
              className={`flex gap-4 md:gap-6 ${msg.role === 'user' ? 'justify-end' : ''}`}
            >
              {msg.role === 'ai' && (
                <div className={`hidden sm:flex w-10 h-10 rounded-2xl ${isDarkMode ? 'bg-gold/10 border-gold/20' : 'bg-gold/5 border-gold/10'} border flex items-center justify-center shrink-0 mt-1 shadow-xl ring-1 ring-gold/20`}>
                  <Shield className="w-5 h-5 text-gold" />
                </div>
              )}
              <div className={`space-y-3 max-w-[90%] md:max-w-3xl ${msg.role === 'user' ? 'order-1' : 'order-2'}`}>
                <div className={`group relative p-6 md:p-8 rounded-[30px] text-[15px] leading-[1.8] shadow-2xl ${
                  msg.role === 'user' 
                  ? 'bg-gold text-black font-bold rounded-tr-md' 
                  : `${theme.bubbleAI} rounded-tl-md backdrop-blur-md`
                }`}>
                  {msg.text.split('\n').map((line, i) => (
                    <p key={i} className={`${i > 0 ? 'mt-4' : ''}`}>
                      {line}
                    </p>
                  ))}
                  
                  {msg.role === 'ai' && (
                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleCopy(msg.text, msg.id)}
                        className={`p-2.5 rounded-xl ${isDarkMode ? 'bg-black/20 hover:bg-gold/20' : 'bg-gray-100 hover:bg-gold/10'} transition-all`}
                        aria-label="Copy response"
                      >
                        {lastCopiedId === msg.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 opacity-50" />}
                      </button>
                    </div>
                  )}
                </div>
                
                {msg.role === 'ai' && idx === messages.length - 1 && sources.length > 0 && (
                  <button 
                    onClick={() => setShowSourcePanel(true)}
                    className="text-[10px] font-black text-gold uppercase tracking-[0.3em] flex items-center gap-2 hover:opacity-80 ml-4 p-2 transition-all hover:gap-4"
                  >
                    NEURAL TRACE VERIFIED <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
          {isThinking && (
            <div className="flex gap-4 md:gap-6 animate-pulse">
              <div className="w-10 h-10 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center shadow-lg">
                <Loader2 className="w-5 h-5 text-gold animate-spin" />
              </div>
              <div className={`px-8 py-6 rounded-[30px] rounded-tl-sm text-[11px] font-black uppercase tracking-widest italic opacity-60 border border-dashed ${theme.border}`}>
                Aurex protocol active...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-12 pt-2 relative z-40">
          <div className="max-w-5xl mx-auto relative group">
            
            <div className="flex flex-wrap justify-center gap-2.5 mb-8">
              {suggestedQuestions.map((q, i) => (
                <button 
                  key={i}
                  onClick={() => handleAsk(q)}
                  disabled={isThinking}
                  className={`text-[11px] font-black uppercase tracking-tight py-3 px-6 rounded-full border transition-all duration-300 active:scale-95 ${
                    isDarkMode 
                    ? 'border-white/5 bg-white/5 hover:bg-gold hover:text-black hover:border-gold disabled:opacity-20' 
                    : 'border-gray-200 bg-white hover:border-gold hover:text-gold shadow-sm disabled:opacity-20'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>

            <div className={`absolute -inset-1 bg-gold rounded-[32px] blur-2xl opacity-0 group-focus-within:opacity-5 transition-all duration-1000 pointer-events-none`} />
            <div className={`relative ${theme.inputBg} border-2 ${theme.border} focus-within:border-gold rounded-[28px] overflow-hidden transition-all shadow-2xl flex items-center p-3 md:p-4 gap-3`}>
              <div className="flex-1 flex items-center gap-4 pl-3">
                <Shield className="hidden sm:block w-6 h-6 text-gold opacity-20" />
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAsk()}
                  placeholder="Inquire with Aurex Protocol..."
                  className={`flex-1 bg-transparent border-none outline-none py-4 text-[16px] font-bold tracking-tight ${theme.text} placeholder-gray-500/50 cursor-text`}
                />
              </div>
              <button 
                onClick={() => handleAsk()}
                disabled={isThinking}
                className="bg-gold hover:bg-gold-dark text-black font-black uppercase tracking-tighter py-5 px-10 rounded-[22px] transition-all hover:scale-[1.02] active:scale-95 shadow-2xl shadow-gold/30 flex items-center gap-4 shrink-0 group/btn disabled:opacity-40"
              >
                {isThinking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 group-hover/btn:translate-x-1.5 transition-transform" />}
                <span className="hidden sm:inline text-sm">Execute</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Right Source Panel */}
      <AnimatePresence>
        {showSourcePanel && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSourcePanel(false)}
              className="lg:hidden fixed inset-0 bg-black/90 backdrop-blur-xl z-[60]"
            />
            <motion.aside 
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`
                fixed lg:relative inset-y-0 right-0 w-full lg:w-[500px] shadow-2xl flex flex-col shrink-0 h-[90vh] lg:h-screen mt-auto 
                rounded-t-[40px] lg:rounded-none ${theme.border} ${theme.sidebar} backdrop-blur-3xl overflow-hidden z-[70] 
                border-t lg:border-t-0 lg:border-l
              `}
            >
              <div className="p-10 md:p-14 flex flex-col h-full overflow-hidden">
                <div className="lg:hidden w-20 h-2 bg-gold/20 rounded-full mx-auto mb-10 cursor-pointer hover:bg-gold transition-colors" onClick={() => setShowSourcePanel(false)} />
                <div className="flex items-center justify-between mb-12">
                  <div className="flex flex-col">
                    <h3 className="text-[12px] font-black uppercase tracking-[0.5em] text-gold">Neural Audit</h3>
                    <span className="text-sm font-black opacity-40 uppercase">Memory Extraction</span>
                  </div>
                  <button onClick={() => setShowSourcePanel(false)} className={`p-4 hover:bg-white/10 rounded-2xl transition-all active:scale-90`} aria-label="Close panel">
                    <X className="w-6 h-6 opacity-40" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-10 pr-4 custom-scrollbar">
                  {sources.map((source, i) => (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} key={i} className="group p-8 rounded-[32px] border border-white/5 bg-white/5 hover:bg-gold/5 hover:border-gold/20 transition-all relative">
                      <div className="flex items-center justify-between mb-6">
                        <span className="text-[11px] font-black uppercase text-gold bg-gold/10 px-3 py-1.5 rounded-lg tracking-widest">Memory Cell {i + 1}</span>
                        <div className="flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-lg shadow-green-500/50" />
                           <span className="text-[11px] font-mono font-black text-gold">{(source.score * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                      <p className="text-[15px] leading-[1.8] italic opacity-80 font-medium">"{source.text}"</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(212, 175, 55, 0.2); border-radius: 20px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(212, 175, 55, 0.4); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        input:focus { outline: none; }
        * { -webkit-tap-highlight-color: transparent; }
      `}} />
    </div>
  );
}

export default App;
