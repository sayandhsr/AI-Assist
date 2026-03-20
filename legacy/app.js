import { CONFIG } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, getDocs, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// DOM Elements
const e = {
    themeSelect: document.getElementById('themeSelect'),
    sidebar: document.getElementById('sidebar'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    openSidebarBtn: document.getElementById('openSidebarBtn'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),
    
    // Auth
    googleSignInBtn: document.getElementById('googleSignInBtn'),
    userProfile: document.getElementById('userProfile'),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
    signOutBtn: document.getElementById('signOutBtn'),
    
    // Chat
    chatForm: document.getElementById('chatForm'),
    userInput: document.getElementById('userInput'),
    chatMessages: document.getElementById('chatMessages'),
    sendBtn: document.getElementById('sendBtn'),
    
    // Translate
    toggleTranslateBtn: document.getElementById('toggleTranslateBtn'),
    translateToolbar: document.getElementById('translateToolbar'),
    targetLanguage: document.getElementById('targetLanguage'),
    cancelTranslateBtn: document.getElementById('cancelTranslateBtn'),
    
    // Document
    fileUpload: document.getElementById('fileUpload'),
    uploadProgressContainer: document.getElementById('uploadProgressContainer'),
    uploadProgressFill: document.getElementById('uploadProgressFill'),
    uploadStatusText: document.getElementById('uploadStatusText'),
    
    documentPanel: document.getElementById('documentPanel'),
    docPanelTitle: document.getElementById('docPanelTitle'),
    documentContentWrapper: document.getElementById('documentContentWrapper'),
    docLoading: document.getElementById('docLoading'),
    documentContent: document.getElementById('documentContent'),
    docActionSummarize: document.getElementById('docActionSummarize'),
    docActionKeyPoints: document.getElementById('docActionKeyPoints'),
    closeDocPanelBtn: document.getElementById('closeDocPanelBtn'),
    
    // History
    historyList: document.getElementById('historyList'),
    
    // Header
    newChatBtn: document.getElementById('newChatBtn'),
};

// State
let appState = {
    user: null,
    isTranslating: false,
    currentDocumentText: null,
    currentDocumentName: null,
    chatHistory: [], // Current session
};

// Initialize Firebase
let auth, db;
try {
    if (CONFIG.FIREBASE_CONFIG.apiKey && CONFIG.FIREBASE_CONFIG.apiKey !== "YOUR_FIREBASE_API_KEY_HERE") {
        const app = initializeApp(CONFIG.FIREBASE_CONFIG);
        auth = getAuth(app);
        db = getFirestore(app);
        initAuthListeners();
    } else {
        console.warn("Firebase config is missing or default. Authentication is simulated or disabled.");
        simulateAuth();
    }
} catch (error) {
    console.error("Firebase Initialization Error:", error);
}

// ----------------------------------------------------
// Theme & UI Handlers
// ----------------------------------------------------
function initTheme() {
    const savedTheme = localStorage.getItem('ai_theme') || 'default';
    e.themeSelect.value = savedTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    e.themeSelect.addEventListener('change', (ev) => {
        const theme = ev.target.value;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('ai_theme', theme);
    });
}

function initSidebar() {
    e.openSidebarBtn.addEventListener('click', () => {
        e.sidebar.classList.add('open');
        e.sidebarOverlay.classList.remove('hidden');
    });
    
    const closeSidebar = () => {
        e.sidebar.classList.remove('open');
        e.sidebarOverlay.classList.add('hidden');
    };
    
    e.closeSidebarBtn.addEventListener('click', closeSidebar);
    e.sidebarOverlay.addEventListener('click', closeSidebar);
}

// ----------------------------------------------------
// Chat & OpenRouter API Integration
// ----------------------------------------------------
async function askAI(promptText, systemInstruction = null) {
    if (!CONFIG.OPENROUTER_API_KEY || CONFIG.OPENROUTER_API_KEY === 'YOUR_OPENROUTER_API_KEY_HERE') {
        throw new Error("OpenRouter API key is not configured.");
    }
    
    // Build conversation as OpenAI-compatible messages
    const messages = [];
    
    // Add system instruction if provided
    if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
    }
    
    // Add conversation history
    appState.chatHistory.forEach(msg => {
        messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.text
        });
    });
    
    // Append the new user message
    messages.push({ role: 'user', content: promptText });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONFIG.OPENROUTER_API_KEY}`,
            'HTTP-Referer': window.location.href,
            'X-Title': 'AI Assistant Pro'
        },
        body: JSON.stringify({
            model: CONFIG.AI_MODEL,
            messages: messages,
            temperature: 0.7,
            max_tokens: 2048,
        })
    });

    if (!response.ok) {
        const err = await response.json();
        console.error("OpenRouter Error:", err);
        throw new Error(err.error?.message || `API Request Failed (${response.status})`);
    }

    const data = await response.json();
    
    // Strict Validation
    if (!data || !data.choices || !data.choices.length || !data.choices[0].message) {
        throw new Error("No valid response from AI");
    }
    
    return data.choices[0].message.content;
}

function addMessageToUI(text, sender = 'user') {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender === 'user' ? 'user-message' : 'ai-message'} fade-in`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = sender === 'user' ? (appState.user ? appState.user.displayName.charAt(0) : 'U') : 'AI';
    
    const content = document.createElement('div');
    content.className = 'message-content markdown-body';
    
    if (sender === 'ai') {
        const rawHtml = marked.parse(text);
        content.innerHTML = DOMPurify.sanitize(rawHtml);
    } else {
        content.textContent = text;
    }
    
    msgDiv.appendChild(avatar);
    msgDiv.appendChild(content);
    e.chatMessages.appendChild(msgDiv);
    
    const scrollContainer = document.querySelector('.content-scroll');
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
}

async function handleChatSubmit(ev) {
    ev.preventDefault();
    const text = e.userInput.value.trim();
    if (!text) return;
    
    e.userInput.value = '';
    e.userInput.style.height = 'auto';
    
    let finalPrompt = text;
    let systemPrompt = null;
    
    if (appState.isTranslating) {
        const langInfo = e.targetLanguage.options[e.targetLanguage.selectedIndex].text;
        systemPrompt = `You are a helpful translator. Translate the user's text into ${langInfo}. Return ONLY the translation, no extra text.`;
    }
    
    addMessageToUI(text, 'user');
    appState.chatHistory.push({ role: 'user', text: text });
    
    e.sendBtn.disabled = true;
    e.userInput.disabled = true;
    
    const typingId = 'typing-' + Date.now();
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message ai-message fade-in';
    typingDiv.id = typingId;
    typingDiv.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content">
            <span class="loading-pulse">Thinking...</span>
        </div>
    `;
    e.chatMessages.appendChild(typingDiv);
    
    try {
        const responseText = await askAI(finalPrompt, systemPrompt);
        
        document.getElementById(typingId).remove();
        
        addMessageToUI(responseText, 'ai');
        appState.chatHistory.push({ role: 'model', text: responseText });
        
        saveChatSession();
        
    } catch (error) {
        document.getElementById(typingId)?.remove();
        addMessageToUI(`**Error:** ${error.message}`, 'ai');
    } finally {
        e.sendBtn.disabled = false;
        e.userInput.disabled = false;
        e.userInput.focus();
    }
}

e.userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    e.sendBtn.disabled = this.value.trim().length === 0;
});

e.userInput.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        if (!e.sendBtn.disabled) {
            e.chatForm.dispatchEvent(new Event('submit'));
        }
    }
});

e.chatForm.addEventListener('submit', handleChatSubmit);

// ----------------------------------------------------
// New Chat Button Handler
// ----------------------------------------------------
e.newChatBtn.addEventListener('click', () => {
    appState.chatHistory = [];
    e.chatMessages.innerHTML = '';
    addMessageToUI("Hello! I'm your premium AI Assistant. I can help answer questions, translate text, and summarize PDF or DOCX files you upload.", "ai");
});

// ----------------------------------------------------
// Translation Toggle
// ----------------------------------------------------
e.toggleTranslateBtn.addEventListener('click', () => {
    appState.isTranslating = true;
    e.translateToolbar.classList.remove('hidden');
    e.toggleTranslateBtn.classList.add('active');
});

e.cancelTranslateBtn.addEventListener('click', () => {
    appState.isTranslating = false;
    e.translateToolbar.classList.add('hidden');
    e.toggleTranslateBtn.classList.remove('active');
});

// ----------------------------------------------------
// Document Parsing (pdf.js & mammoth)
// ----------------------------------------------------
e.fileUpload.addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    
    e.uploadProgressContainer.classList.remove('hidden');
    e.uploadStatusText.textContent = `Reading ${file.name}...`;
    e.uploadProgressFill.style.width = '30%';
    
    try {
        let extractedText = "";
        
        if (file.name.toLowerCase().endsWith('.pdf')) {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            e.uploadProgressFill.style.width = '50%';
            
            const pdf = await loadingTask.promise;
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const strings = content.items.map(item => item.str);
                extractedText += strings.join(' ') + '\n';
            }
        } else if (file.name.toLowerCase().endsWith('.docx')) {
            const arrayBuffer = await file.arrayBuffer();
            e.uploadProgressFill.style.width = '60%';
            const result = await mammoth.extractRawText({ arrayBuffer });
            extractedText = result.value;
        } else {
            throw new Error("Unsupported file format.");
        }
        
        e.uploadProgressFill.style.width = '100%';
        e.uploadStatusText.textContent = "Extraction complete!";
        
        setTimeout(() => {
            e.uploadProgressContainer.classList.add('hidden');
            e.uploadProgressFill.style.width = '0%';
        }, 2000);
        
        appState.currentDocumentText = extractedText;
        appState.currentDocumentName = file.name;
        
        e.documentPanel.classList.remove('hidden');
        e.docPanelTitle.textContent = `Document: ${file.name}`;
        e.documentContentWrapper.classList.add('hidden');
        e.documentContent.innerHTML = '';
        
        appState.chatHistory.push({
            role: 'user',
            text: `[System Update: I have uploaded a document named "${file.name}". Its content is: ${extractedText.substring(0, 5000)}...]`
        });
        
    } catch (error) {
        console.error("Extraction error:", error);
        e.uploadStatusText.textContent = "Error reading file.";
        e.uploadProgressFill.style.backgroundColor = 'var(--error-color)';
    }
});

async function documentAction(type) {
    if (!appState.currentDocumentText) return;
    
    e.documentContentWrapper.classList.remove('hidden');
    e.docLoading.classList.remove('hidden');
    e.documentContent.innerHTML = '';
    
    const prompt = type === 'summarize' 
        ? "Please write a concise summary of the following document:\n\n" 
        : "Please list the key points and takeaways from the following document in bullet points:\n\n";
        
    const textChunk = appState.currentDocumentText.substring(0, 15000);
    
    try {
        const response = await askAI(prompt + textChunk);
        e.docLoading.classList.add('hidden');
        const rawHtml = marked.parse(response);
        e.documentContent.innerHTML = DOMPurify.sanitize(rawHtml);
    } catch (error) {
        e.docLoading.classList.add('hidden');
        e.documentContent.innerHTML = `<p style="color:var(--error-color)">Error analyzing document: ${error.message}</p>`;
    }
}

e.docActionSummarize.addEventListener('click', () => documentAction('summarize'));
e.docActionKeyPoints.addEventListener('click', () => documentAction('keyPoints'));
e.closeDocPanelBtn.addEventListener('click', () => {
    e.documentPanel.classList.add('hidden');
});

// ----------------------------------------------------
// Authentication & Firestore Logic
// ----------------------------------------------------
function initAuthListeners() {
    onAuthStateChanged(auth, (user) => {
        appState.user = user;
        if (user) {
            e.googleSignInBtn.classList.add('hidden');
            e.userProfile.classList.remove('hidden');
            e.userName.textContent = user.displayName;
            e.userAvatar.src = user.photoURL || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ccc"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="20">U</text></svg>';
            loadChatHistory();
        } else {
            e.googleSignInBtn.classList.remove('hidden');
            e.userProfile.classList.add('hidden');
            e.historyList.innerHTML = '<div class="empty-state small-text">Login to view history</div>';
        }
    });

    e.googleSignInBtn.addEventListener('click', () => {
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth, provider).catch(error => {
            console.error("Auth error:", error);
            alert("Login failed: " + error.message);
        });
    });

    e.signOutBtn.addEventListener('click', () => {
        signOut(auth);
        appState.chatHistory = [];
        e.chatMessages.innerHTML = '';
        addMessageToUI("Hello! I'm your premium AI Assistant. I can help answer questions, translate text, and summarize PDF or DOCX files you upload.", "ai");
    });
}

function simulateAuth() {
    e.googleSignInBtn.addEventListener('click', () => {
        alert("Firebase is not configured. Simulating Google Sign-In is not possible without a valid config in config.js. Please provide API credentials to test Auth.");
    });
}

async function saveChatSession() {
    if (!auth || !appState.user) return;
    try {
        // Here we just save/update the latest chat message in a generic structure for demo purposes
        const docRef = await addDoc(collection(db, "chats"), {
            userId: appState.user.uid,
            messages: appState.chatHistory.slice(-5), // only save last 5 for brevity in demo
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Error saving chat: ", e);
    }
}

async function loadChatHistory() {
    if (!auth || !appState.user) return;
    try {
        const q = query(collection(db, "chats"), where("userId", "==", appState.user.uid), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        
        e.historyList.innerHTML = '';
        if (querySnapshot.empty) {
            e.historyList.innerHTML = '<div class="empty-state small-text">No history found</div>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = 'history-item';
            const firstUserMsg = data.messages.find(m => m.role === 'user');
            div.textContent = firstUserMsg ? firstUserMsg.text : 'Empty Session';
            
            div.addEventListener('click', () => {
                appState.chatHistory = data.messages;
                e.chatMessages.innerHTML = '';
                addMessageToUI("Hello! I'm your premium AI Assistant. I loaded your previous session.", "ai");
                data.messages.forEach(msg => {
                    addMessageToUI(msg.text, msg.role === 'model' ? 'ai' : 'user');
                });
            });
            e.historyList.appendChild(div);
        });
    } catch (e) {
        console.error("Error loading history: ", e);
        e.historyList.innerHTML = '<div class="empty-state small-text">Configure Firestore Security Rules</div>';
    }
}

// ----------------------------------------------------
// Initialization
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initSidebar();
});
