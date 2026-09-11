import React, { useEffect, useState, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { WebsocketProvider } from 'y-websocket';
import { Code, Sparkles } from 'lucide-react';
import { AIPanel } from './AIPanel';

// ==========================================
// SECTION 1: CONSTANTS & UTILITIES
// ==========================================

// Lists of adjectives and nouns used to assign fun, anonymous helper names
// to users connecting to the collaborative editing room without logging in.
const ADJECTIVES = ['Sleek', 'Vibrant', 'Agile', 'Bright', 'Clever', 'Smart', 'Creative', 'Rapid', 'Epic', 'Stellar', 'Quantum', 'Hyper', 'Nova'];
const NOUNS = ['Coder', 'Dev', 'Hacker', 'Scribe', 'Architect', 'Wizard', 'Ninja', 'Guru', 'Pioneer', 'Captain', 'Scripter', 'Stylist'];

// Color palette for user identity. These colors are used for user badges,
// remote cursor carats, and selection highlights in the editor.
const PALETTE = [
  '#f43f5e', // Rose
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#a855f7', // Purple
  '#ec4899', // Pink
];

/**
 * Generates a random presence configuration (name + color badge) for the user.
 * Combines a random adjective, a random noun, and a random color from our palette.
 */
const getRandomPresence = () => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  return { name: `${adj} ${noun}`, color };
};

// ==========================================
// SECTION 2: COMPONENT INTERFACES
// ==========================================

/**
 * UserPresence represents the state of a connected collaborator in the room.
 */
interface UserPresence {
  clientId: number; // Unique identifier assigned by Yjs for the connection session
  name: string;      // The anonymous username of the user (e.g., "Sleek Dev")
  color: string;     // The hex color associated with the user's cursor/badge
  isSelf: boolean;   // True if this represents the local client, false otherwise
}

/**
 * TerminalState represents the output state of the terminal.
 * This is synced across all clients via Yjs so everyone sees executions in real-time.
 */
interface TerminalState {
  isRunning: boolean;        // True if code compilation/execution is currently in progress
  stdout: string;            // Standard output stream from the code execution
  stderr: string;            // Standard error stream from the code execution
  compilationError: string;  // Detailed error message if compilation failed (C++ specific)
  runBy: string;             // Name of the collaborator who triggered the last execution
  executionTime: number;     // Time taken to execute the code on the server in milliseconds
}

// ==========================================
// SECTION 3: SUB-COMPONENTS & ICONS
// ==========================================

// SVG Play Icon for the "Run Code" button
const PlayIcon = () => (
  <svg 
    width="14" 
    height="14" 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    style={{ marginRight: '6px' }}
  >
    <path d="M8 5v14l11-7z" />
  </svg>
);

// SVG Trash Icon for the "Clear Output" button
const TrashIcon = () => (
  <svg 
    width="14" 
    height="14" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    style={{ marginRight: '6px' }}
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export interface CollaborativeEditorProps {
  language: string;                   // The currently selected language mode
  setLanguage: (lang: string) => void;// Callback function to update selected language state
  filename: string;                   // The currently active custom filename
  setFilename: (name: string) => void;// Callback function to update the filename state
}

// ==========================================
// SECTION 4: MAIN COMPONENT - STATE & REFS
// ==========================================

export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({ language, setLanguage, filename, setFilename }) => {
  const { roomId = 'default' } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  // State to store the active Monaco Editor instance once mounted
  const [editor, setEditor] = useState<any>(null);
  
  // State containing the list of all active collaborators in the current room
  const [activeUsers, setActiveUsers] = useState<UserPresence[]>([]);
  
  // Local state for the terminal window, including running indicators and output streams
  const [terminalState, setTerminalState] = useState<TerminalState>({
    isRunning: false,
    stdout: '',
    stderr: '',
    compilationError: '',
    runBy: '',
    executionTime: 0,
  });
  
  // State for standard input (stdin) that is sent to the compiler sandbox
  const [stdinInput, setStdinInput] = useState<string>('');
  
  // State representing the socket connection status to the websocket server
  const [isConnected, setIsConnected] = useState<boolean>(false);
  
  // State representing if the invite link was recently copied (handles button UI feedback)
  const [linkCopied, setLinkCopied] = useState<boolean>(false);

  // AI companion & Auto-Fix States
  const [isAIPanelOpen, setIsAIPanelOpen] = useState<boolean>(false);
  const [isAutoFixing, setIsAutoFixing] = useState<boolean>(false);
  const [autoFixExplanation, setAutoFixExplanation] = useState<string | null>(null);

  // References to keep persistent instances of the Yjs document (Y.Doc) and the WebsocketProvider
  // across re-renders. This ensures our callback triggers have access to active connection states.
  const yDocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);

  /**
   * Applies AI-generated code directly into the Yjs CRDT document so all collaborators see the patch live.
   */
  const handleApplyAICode = (newCode: string) => {
    const normalizedCode = newCode.replace(/\r\n/g, '\n').trim();
    const yDoc = yDocRef.current;
    if (yDoc) {
      const yText = yDoc.getText('monaco');
      yDoc.transact(() => {
        const len = yText.length;
        if (len > 0) {
          yText.delete(0, len);
        }
        yText.insert(0, normalizedCode);
      });
    }
    if (editor) {
      const model = editor.getModel();
      if (model && model.getValue() !== normalizedCode) {
        model.setValue(normalizedCode);
      }
    }
  };

  /**
   * Triggers Agentic AI Auto-Fix when code execution fails in the Docker sandbox.
   */
  const handleAutoFix = async () => {
    if (!editor) return;
    const errorLog = terminalState.compilationError || terminalState.stderr;
    if (!errorLog) return;

    setIsAutoFixing(true);
    setAutoFixExplanation(null);

    let apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl || apiUrl.includes('localhost')) {
      const hostname = window.location.hostname;
      const protocol = window.location.protocol;
      apiUrl = `${protocol}//${hostname}:1234`;
    }

    try {
      const model = editor.getModel();
      const code = model ? model.getValue() : '';

      const res = await fetch(`${apiUrl}/api/ai/autofix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, errorLog, language, stdin: stdinInput })
      });

      const data = await res.json();
      if (data.success && data.fixedCode) {
        handleApplyAICode(data.fixedCode);
        setAutoFixExplanation(data.explanation || 'Fixed execution error.');
      } else {
        setAutoFixExplanation(data.error || 'Failed to auto-fix code.');
      }
    } catch (err: any) {
      setAutoFixExplanation(`Auto-Fix Error: ${err.message}`);
    } finally {
      setIsAutoFixing(false);
    }
  };

  // ==========================================
  // SECTION 5: EDITOR MOUNT & LOGIC
  // ==========================================

  /**
   * Triggers when the Monaco Editor finishes mounting inside the DOM.
   * We store the editor instance and configure line ending preferences.
   */
  const handleEditorDidMount: OnMount = (editorInstance, monacoInstance) => {
    setEditor(editorInstance);
    
    // Line Endings Normalization:
    // It is critical to enforce LF (\n) line endings on both the initial load and any subsequent
    // model changes. If different clients use different line endings (Windows uses CRLF \r\n,
    // macOS/Linux uses LF \n), it will cause cursor offset sync mismatches and document desync in Yjs.
    const model = editorInstance.getModel();
    if (model) {
      model.setEOL(monacoInstance.editor.EndOfLineSequence.LF);
    }

    // Bind event to enforce LF line endings whenever the editor swaps file models
    editorInstance.onDidChangeModel(() => {
      const currentModel = editorInstance.getModel();
      if (currentModel) {
        currentModel.setEOL(monacoInstance.editor.EndOfLineSequence.LF);
      }
    });
  };

  /**
   * Triggers file download of the current Monaco Editor content.
   */
  const handleDownloadCode = () => {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const code = model.getValue();
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /**
   * Cleans connection state and navigates back to landing page.
   */
  const handleLeaveRoom = () => {
    navigate('/');
  };

  /**
   * Returns the anonymous username assigned to the local user.
   * Safely reads the client's local user configuration from the Yjs awareness state.
   */
  const getLocalUsername = () => {
    const provider = providerRef.current;
    if (!provider) return 'Someone';
    const localState = provider.awareness.getLocalState();
    return localState?.user?.name || 'Someone';
  };

  // ==========================================
  // SECTION 6: ACTION HANDLERS
  // ==========================================

  /**
   * Triggers code compilation & execution.
   * Instead of just running locally, this uses Yjs's shared map ('terminal-logs') to synchronize
   * execution state. All users see when someone is running code, and they receive the output in real-time.
   */
  const handleRunCode = async () => {
    const yDoc = yDocRef.current;
    const provider = providerRef.current;
    if (!yDoc || !provider || !editor) return;

    // Retrieve/create the shared key-value map for terminal output on the Yjs doc
    const yMap = yDoc.getMap('terminal-logs');
    const runBy = getLocalUsername();

    // 1. Enter Transaction: Set execution state to true for all collaborators.
    // By wrapping state changes in a Yjs transaction, updates are bundled into a single synchronization payload.
    yDoc.transact(() => {
      yMap.set('isRunning', true);
      yMap.set('runBy', runBy);
      yMap.set('stdout', '');
      yMap.set('stderr', '');
      yMap.set('compilationError', '');
    });

    try {
      // Extract the current source code from Monaco Editor
      const model = editor.getModel();
      const code = model ? model.getValue() : '';

      // Determine backend execution URL based on Vite environment configurations.
      // Falls back to checking current window hostname if environment variable is local/missing.
      let apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl || apiUrl.includes('localhost')) {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        apiUrl = `${protocol}//${hostname}:1234`;
      }

      // POST request to trigger the execution engine
      const response = await fetch(`${apiUrl}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code, 
          stdin: stdinInput, 
          language, 
          customFilename: filename,
          roomId: roomId // Dynamic room identity for decoupled queue routing
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log(`[Execution] Job successfully queued with ID: ${result.jobId}`);
    } catch (err: any) {
      console.error('Error executing code:', err);
      // In case of a server connection failure, reset execution state and broadcast error
      yDoc.transact(() => {
        yMap.set('isRunning', false);
        yMap.set('compilationError', `Network or Server Error: ${err.message}`);
      });
    }
  };

  /**
   * Resets the shared terminal map on the Yjs doc.
   * This clears the stdout/stderr for all active clients in the session.
   */
  const handleClearTerminal = () => {
    const yDoc = yDocRef.current;
    if (!yDoc) return;
    const yMap = yDoc.getMap('terminal-logs');
    yDoc.transact(() => {
      yMap.set('isRunning', false);
      yMap.set('stdout', '');
      yMap.set('stderr', '');
      yMap.set('compilationError', '');
      yMap.set('runBy', '');
      yMap.set('executionTime', 0);
    });
  };

  /**
   * Copies the current window URL to the user's clipboard.
   * Enables sharing the unique workspace room ID link with other collaborators.
   */
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    // Reset "Copied!" feedback text after 2 seconds
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // ==========================================
  // SECTION 7: SYNC EFFECTS
  // ==========================================

  // ==========================================
  // SECTION 7: ACTION HANDLERS FOR LANGUAGE
  // ==========================================

  /**
   * Handles language dropdown changes.
   */
  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
  };

  // ==========================================
  // SECTION 8: CORE COLLABORATION HANDLER (WebSocket Setup, Monaco binding)
  // ==========================================

  /**
   * Primary side effect hook managing the Yjs document state.
   * Triggered when the editor mounting completes. Initializes WS connection,
   * binds Monaco editor fields, listens to awareness changes, and handles cleanup.
   */
  useEffect(() => {
    if (!editor) return;

    // 1. Instantiate the central collaborative document (Y.Doc).
    // Y.Doc acts as the shared state database that tracks historical operational updates (CRDTs).
    const yDoc = new Y.Doc();
    
    // 2. Access/initialize the shared text block inside the document.
    // 'monaco' is the name of the shared text variable that holds the actual source code.
    const yText = yDoc.getText('monaco');
    
    const model = editor.getModel();
    if (!model) return;

    // Enforce LF line endings globally inside Monaco
    model.setEOL(0); // 0 corresponds to LF (EndOfLineSequence.LF)

    // 3. Connect to the Yjs sync server using WebSocket connection.
    // Looks for environment variables, otherwise guesses standard port 1234.
    let wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl || wsUrl.includes('localhost')) {
      const hostname = window.location.hostname;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${hostname}:1234`;
    }
    
    // The WebsocketProvider establishes a continuous connection, sharing and receiving updates.
    const provider = new WebsocketProvider(
      wsUrl,
      roomId,
      yDoc
    );

    // Update connection status in local component state
    provider.on('status', (event: { status: string }) => {
      setIsConnected(event.status === 'connected');
    });

    // Keep global refs updated
    yDocRef.current = yDoc;
    providerRef.current = provider;

    // 4. Generate local user details and inject into the Awareness system.
    // Awareness tracks non-permanent state like cursor locations, selections, names, and colors.
    const localUser = getRandomPresence();
    provider.awareness.setLocalStateField('user', localUser);

    // 5. Connect/Bind the Monaco Editor component with Yjs.
    // MonacoBinding handles bridging Monaco editor operations (keystrokes, text insertions/deletions)
    // with Yjs CRDT operations, synchronizing text and remote cursors.
    const binding = new MonacoBinding(
      yText,
      model,
      new Set([editor]),
      provider.awareness
    );

    // 6. Set up listener for the shared Terminal Output map ('terminal-logs').
    // Whenever any user triggers compilation/clears output, this listener runs,
    // syncing terminal output states to the React layout.
    const yMap = yDoc.getMap('terminal-logs');
    const handleMapChange = () => {
      setTerminalState({
        isRunning: !!yMap.get('isRunning'),
        stdout: (yMap.get('stdout') as string) || '',
        stderr: (yMap.get('stderr') as string) || '',
        compilationError: (yMap.get('compilationError') as string) || '',
        runBy: (yMap.get('runBy') as string) || '',
        executionTime: (yMap.get('executionTime') as number) || 0,
      });
    };

    yMap.observe(handleMapChange);
    handleMapChange(); // Run initial state fetch

    // 7. Handle changes to the Awareness state (remote cursors, active users count).
    // Whenever someone enters, leaves, or moves their cursor:
    const handleAwarenessChange = () => {
      const states = Array.from(provider.awareness.getStates());
      
      // Update local state list of active users to render current users in the header bar
      const users: UserPresence[] = states.map(([clientId, state]) => {
        const user = state.user || {};
        return {
          clientId,
          name: user.name || `User ${clientId}`,
          color: user.color || '#9ca3af',
          isSelf: clientId === yDoc.clientID,
        };
      });
      setActiveUsers(users);

      // --- DYNAMIC CSS GENERATION FOR REMOTE CURSORS ---
      // We dynamically inject CSS rules into the document head to style the remote cursors
      // and text selections of active collaborators based on their designated user colors.
      let styleElement = document.getElementById('yjs-awareness-styles') as HTMLStyleElement;
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'yjs-awareness-styles';
        document.head.appendChild(styleElement);
      }

      let cssRules = '';
      states.forEach(([clientId, state]) => {
        if (state.user) {
          const { name, color } = state.user;
          const isSelf = clientId === yDoc.clientID;
          
          // CSS Rules:
          // - .yRemoteSelection-${clientId}: Highlights selection backgrounds with user-color at 15% opacity (hex '25').
          // - .yRemoteSelectionHead-${clientId}: Renders a 2px vertical caret line colored with user's color.
          // - .yRemoteSelectionHead-${clientId}::after: Renders a floating tooltip above the caret showing the collaborator's name.
          cssRules += `
            .yRemoteSelection-${clientId} {
              background-color: ${color}25 !important;
            }
            .yRemoteSelectionHead-${clientId} {
              border-left: 2px solid ${color} !important;
              position: absolute;
              height: 100%;
            }
            .yRemoteSelectionHead-${clientId}::after {
              content: '${name}';
              background-color: ${color};
              color: #ffffff;
              position: absolute;
              font-family: 'Outfit', sans-serif;
              font-size: 10px;
              font-weight: 600;
              padding: 2px 6px;
              border-radius: 4px;
              top: -20px;
              left: -2px;
              white-space: nowrap;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
              pointer-events: none;
              z-index: 100;
              opacity: ${isSelf ? 0 : 1};
            }
          `;
        }
      });
      styleElement.innerHTML = cssRules;
    };

    provider.awareness.on('change', handleAwarenessChange);
    handleAwarenessChange(); // Run initial fetch

    console.log('Bound Monaco Editor with synced terminal logs to Yjs WebSocket Provider');

    // 8. Cleanup Hook: Triggers when the component unmounts.
    // Crucial to destroy bindings and close socket connections to prevent memory/socket leaks.
    return () => {
      binding.destroy();
      provider.destroy();
      yDoc.destroy();
      
      const styleElement = document.getElementById('yjs-awareness-styles');
      if (styleElement) styleElement.remove();
      
      yDocRef.current = null;
      providerRef.current = null;
      
      console.log('Cleaned up Yjs Monaco binding, provider & styles');
    };
  }, [editor]);

  // ==========================================
  // SECTION 9: COMPONENT RENDERING & LAYOUT
  // ==========================================
  return (
    <div className="app-container">
      {/* App Header */}
      <header className="app-header">
        <div className="header-left">
          {/* Logo icon represented as SVG code brackets */}
          <div className="logo-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
          </div>
          {/* Brand info with the app title and synchronization mode badge */}
          <div className="brand-info">
            <span className="brand-name">CoEdit</span>
            <span className="badge">Online Sync</span>
          </div>
        </div>
        
        <div className="header-right">
          {/* Real-time server status indicator showing the dynamic roomId */}
          <div className="status-indicator">
            <span className="pulse-dot online"></span>
            <span className="status-text">Connected ({roomId})</span>
          </div>
          {/* User avatars container mapping over active users */}
          <div className="user-avatars flex items-center gap-1.5 ml-2">
            {activeUsers.slice(0, 4).map((user) => (
              <div 
                key={user.clientId}
                className="w-8 h-8 rounded-full border-2 border-slate-900 flex items-center justify-center font-bold text-xs text-white shadow-sm transition-transform duration-200 hover:-translate-y-0.5 select-none"
                style={{ backgroundColor: user.color, marginLeft: activeUsers.length > 1 ? '-8px' : '0px' }}
                title={user.name}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            ))}
            {activeUsers.length > 4 && (
              <div className="w-8 h-8 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center font-bold text-[10px] text-slate-300 shadow-sm -ml-2 select-none" title={`${activeUsers.length - 4} more collaborators`}>
                +{activeUsers.length - 4}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="editor-main">
        {/* Left Sidebar */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between p-4 text-sm font-sans select-none text-slate-600 shadow-sm">
          <div className="flex flex-col gap-6">
            
            {/* Workspace / Files Explorer Section */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 px-2 flex items-center justify-between">
                <span>Workspace</span>
                <Code className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <ul className="flex flex-col gap-1">
                <li className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/60 font-medium">
                  {/* File SVG Icon */}
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  {/* Editable filename input */}
                  <input 
                    type="text" 
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    className="bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-300 focus:bg-white outline-none text-xs text-slate-800 px-1 py-0.5 rounded transition-all duration-150 w-full font-medium"
                  />
                </li>
              </ul>
            </div>

            {/* Collaborators Section */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 px-2 flex items-center justify-between">
                <span>Collaborators</span>
                <span className="bg-indigo-50 text-indigo-600 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">{activeUsers.length}</span>
              </div>
              <ul className="flex flex-col gap-1.5 px-1 max-h-48 overflow-y-auto">
                {activeUsers.map((user) => (
                  <li key={user.clientId} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-slate-100/70 text-slate-700 transition-colors duration-150">
                    <div 
                      className="w-2 h-2 rounded-full shadow-sm"
                      style={{ backgroundColor: user.color, boxShadow: `0 0 6px ${user.color}` }}
                    ></div>
                    <span className="truncate text-xs font-medium">{user.name} {user.isSelf ? '(You)' : ''}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>

          {/* Bottom Actions and Social Links */}
          <div className="flex flex-col gap-4 mt-auto">
            
            {/* Utility Buttons */}
            <div className="flex flex-col gap-2 border-t border-slate-200 pt-4">
              <button 
                onClick={handleDownloadCode}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-xs font-semibold text-slate-700 border border-slate-200 transition-all duration-150 cursor-pointer"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download Code
              </button>
              
              <button 
                onClick={handleLeaveRoom}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-600 border border-rose-200 transition-all duration-150 cursor-pointer"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                Leave Room
              </button>
            </div>

            {/* Social Links */}
            <div className="flex gap-4 justify-center border-t border-slate-200 pt-3">
              <a href="https://github.com/ashwinikr295" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-indigo-600 transition-colors duration-150 flex items-center gap-1 text-xs font-medium">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .33.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                GitHub
              </a>
              <a href="https://www.linkedin.com/in/ashwini-kumar-6928a527a/" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-indigo-600 transition-colors duration-150 flex items-center gap-1 text-xs font-medium">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.924 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/></svg>
                LinkedIn
              </a>
            </div>
          </div>
        </aside>

        {/* Main Editor Screen Wrapper */}
        <section className="editor-container-outer">
          <div className="editor-container-inner" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
            
            {/* Reconnecting banner shown if the socket connection is lost */}
            {!isConnected && (
              <div className="reconnecting-banner" style={{ backgroundColor: '#ef4444', color: 'white', padding: '8px', textAlign: 'center', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold' }}>
                Connection lost. Reconnecting...
              </div>
            )}

            {/* Top Bar: Lists language selectors, invite copy action, and Run buttons */}
            <div className="active-users-bar">
              <div className="active-users-title-container">
                <span className="active-users-title">Editor Workspace</span>
              </div>

              {/* Editor Actions Panel (Select, Copy Link, Run button) */}
              <div className="editor-actions">
                {/* Select dropdown to toggle programming language context */}
                <select 
                  value={language} 
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  style={{ marginRight: '8px', padding: '6px 12px', borderRadius: '6px', backgroundColor: '#f1f5f9', color: '#0f172a', border: '1px solid #e2e8f0', fontFamily: "'Outfit', sans-serif", fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
                >
                  <option value="cpp">C++</option>
                  <option value="javascript">JS</option>
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                </select>

                {/* Button to copy shareable URL to clipboard */}
                <button 
                  className="invite-btn"
                  onClick={handleCopyLink}
                  style={{ marginRight: '8px', padding: '6px 12px', borderRadius: '6px', backgroundColor: '#f1f5f9', color: '#0f172a', border: '1px solid #e2e8f0', cursor: 'pointer', fontFamily: "'Outfit', sans-serif", fontSize: '13px', fontWeight: 500, transition: 'background-color 0.2s' }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                >
                  {linkCopied ? 'Copied!' : 'Copy Invite Link'}
                </button>

                {/* Button to trigger compilation and execution */}
                <button 
                  className="run-btn" 
                  onClick={handleRunCode}
                  disabled={terminalState.isRunning || !isConnected}
                  style={{ marginRight: '8px' }}
                >
                  <PlayIcon />
                  {terminalState.isRunning ? 'Executing...' : 'Run Code'}
                </button>

                {/* AI companion Toggle Button */}
                <button 
                  className="ai-copilot-btn"
                  onClick={() => setIsAIPanelOpen(!isAIPanelOpen)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '13px',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI companion
                </button>
              </div>
            </div>

            {/* Main workspace layout: split vertically into code editor (top/center) and terminals (bottom) */}
            <div className="workspace-split" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '16px', minHeight: 0 }}>
              
              {/* Monaco Editor Wrapper */}
              <div className="editor-wrapper" style={{ flex: 1.8, minHeight: '320px', position: 'relative', width: '100%' }}>
                <Editor
                  height="100%"
                  width="100%"
                  language={language}
                  theme="vs"
                  options={{
                    minimap: { enabled: true },
                    fontSize: 15,
                    fontFamily: "'Fira Code', 'Courier New', Courier, monospace",
                    fontLigatures: true,
                    wordWrap: 'on',
                    automaticLayout: true,
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: 'on',
                    padding: { top: 16, bottom: 16 },
                    roundedSelection: true,
                    scrollbar: {
                      verticalScrollbarSize: 10,
                      horizontalScrollbarSize: 10,
                    },
                  }}
                  onMount={handleEditorDidMount}
                />
              </div>

              {/* Bottom panel split horizontally: Standard Input (left) and Terminal Output (right) */}
              <div className="bottom-panels" style={{ display: 'flex', gap: '16px', flex: 1, minHeight: '180px', maxHeight: '300px' }}>
                
                {/* Stdin (Standard Input) Panel */}
                <div className="terminal-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="terminal-header">
                    <div className="terminal-title-container">
                      <span className="terminal-title">Standard Input</span>
                    </div>
                  </div>
                  <textarea
                    className="stdin-textarea"
                    value={stdinInput}
                    onChange={(e) => setStdinInput(e.target.value)}
                    placeholder="Enter standard input here..."
                    spellCheck={false}
                  />
                </div>
                
                {/* Terminal Output Panel */}
                <div className="terminal-panel" style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
                  <div className="terminal-header">
                    <div className="terminal-title-container">
                      <span className="terminal-title">Terminal Output</span>
                      
                      {/* Visual badges showing runtime details and executor identity */}
                      {terminalState.isRunning && (
                        <div className="terminal-status-pill running">
                          <span className="pulse-dot"></span>
                          {terminalState.runBy} is running...
                        </div>
                      )}
                      {!terminalState.isRunning && terminalState.runBy && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div className="terminal-status-pill executed">
                            Last run by {terminalState.runBy}
                          </div>
                          {terminalState.executionTime > 0 && (
                            <div className="terminal-status-pill" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)', fontVariantNumeric: 'tabular-nums' }}>
                              ⏱ {terminalState.executionTime}ms
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Agentic AI Auto-Fix button when execution error occurs */}
                      {(terminalState.compilationError || terminalState.stderr) && !terminalState.isRunning && (
                        <button
                          onClick={handleAutoFix}
                          disabled={isAutoFixing}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                            color: '#ffffff',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: "'Outfit', sans-serif",
                            fontSize: '12px',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)',
                            opacity: isAutoFixing ? 0.6 : 1,
                          }}
                        >
                          <Sparkles className="w-3 h-3" />
                          {isAutoFixing ? 'Fixing...' : '✨ Auto-Fix with AI'}
                        </button>
                      )}

                      {/* Button to clear terminal outputs */}
                      <button className="clear-btn" onClick={() => { handleClearTerminal(); setAutoFixExplanation(null); }} title="Clear terminal output for all users">
                        <TrashIcon />
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Output streams body */}
                  <div className="terminal-body" style={{ flex: 1, overflowY: 'auto' }}>
                    {/* AI Auto-Fix explanation banner if present */}
                    {autoFixExplanation && (
                      <div style={{ padding: '8px 12px', margin: '4px 8px 8px', borderRadius: '6px', backgroundColor: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#c7d2fe', fontSize: '12px' }}>
                        <strong style={{ color: '#818cf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Sparkles className="w-3.5 h-3.5" /> AI Auto-Fix Result:
                        </strong>
                        {autoFixExplanation}
                      </div>
                    )}

                    {/* Compilation errors list (C++ syntax issues, etc.) */}
                    {terminalState.compilationError && (
                      <div className="terminal-line error">{terminalState.compilationError}</div>
                    )}
                    {/* General program stderr output (Python stacktraces, JS exceptions) */}
                    {terminalState.stderr && (
                      <div className="terminal-line error">{terminalState.stderr}</div>
                    )}
                    {/* Program standard stdout stream */}
                    {terminalState.stdout && (
                      <pre className="terminal-stdout">{terminalState.stdout}</pre>
                    )}
                    {/* Default placeholder instruction */}
                    {!terminalState.isRunning && !terminalState.compilationError && !terminalState.stderr && !terminalState.stdout && (
                      <div className="terminal-placeholder">
                        - Click "Run Code" above to execute code collaboratively...
                      </div>
                    )}
                    {/* Status indicator shown while waiting for response */}
                    {terminalState.isRunning && !terminalState.stdout && !terminalState.compilationError && !terminalState.stderr && (
                      <div className="terminal-line loading">Waiting for output...</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Render AI companion Drawer */}
      <AIPanel
        isOpen={isAIPanelOpen}
        onClose={() => setIsAIPanelOpen(false)}
        getCode={() => (editor ? editor.getModel()?.getValue() || '' : '')}
        onApplyCode={handleApplyAICode}
        language={language}
      />
    </div>
  );
};
