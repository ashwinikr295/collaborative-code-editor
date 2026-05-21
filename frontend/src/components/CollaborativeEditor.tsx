import React, { useEffect, useState, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { WebsocketProvider } from 'y-websocket';

const ADJECTIVES = ['Sleek', 'Vibrant', 'Agile', 'Bright', 'Clever', 'Smart', 'Creative', 'Rapid', 'Epic', 'Stellar', 'Quantum', 'Hyper', 'Nova'];
const NOUNS = ['Coder', 'Dev', 'Hacker', 'Scribe', 'Architect', 'Wizard', 'Ninja', 'Guru', 'Pioneer', 'Captain', 'Scripter', 'Stylist'];
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

const getRandomPresence = () => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  return { name: `${adj} ${noun}`, color };
};

interface UserPresence {
  clientId: number;
  name: string;
  color: string;
  isSelf: boolean;
}

interface TerminalState {
  isRunning: boolean;
  stdout: string;
  stderr: string;
  compilationError: string;
  runBy: string;
  executionTime: number;
}

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

const TEMPLATES = {
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your C++ code here\n    return 0;\n}\n`,
  python: `# Write your Python code here\n`,
  javascript: `const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf-8').trim();\n// Write your JS code here\n`,
};

export interface CollaborativeEditorProps {
  language: string;
  setLanguage: (lang: string) => void;
  filename: string;
}

export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({ language, setLanguage, filename }) => {
  const [editor, setEditor] = useState<any>(null);
  const [activeUsers, setActiveUsers] = useState<UserPresence[]>([]);
  const [terminalState, setTerminalState] = useState<TerminalState>({
    isRunning: false,
    stdout: '',
    stderr: '',
    compilationError: '',
    runBy: '',
    executionTime: 0,
  });
  const [stdinInput, setStdinInput] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [linkCopied, setLinkCopied] = useState<boolean>(false);

  // Keep references to Yjs doc & provider to access from action triggers
  const yDocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);

  const handleEditorDidMount: OnMount = (editorInstance) => {
    setEditor(editorInstance);
  };

  const getLocalUsername = () => {
    const provider = providerRef.current;
    if (!provider) return 'Someone';
    const localState = provider.awareness.getLocalState();
    return localState?.user?.name || 'Someone';
  };

  const handleRunCode = async () => {
    const yDoc = yDocRef.current;
    const provider = providerRef.current;
    if (!yDoc || !provider || !editor) return;

    const yMap = yDoc.getMap('terminal-logs');
    const runBy = getLocalUsername();

    // 1. Set executing state for everyone
    yDoc.transact(() => {
      yMap.set('isRunning', true);
      yMap.set('runBy', runBy);
      yMap.set('stdout', '');
      yMap.set('stderr', '');
      yMap.set('compilationError', '');
    });

    try {
      // Get code from Monaco editor
      const model = editor.getModel();
      const code = model ? model.getValue() : '';

      // 2. Fetch execution API
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:1234';
      const response = await fetch(`${apiUrl}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, stdin: stdinInput, language, customFilename: filename }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // 3. Write results back to the synced map
      yDoc.transact(() => {
        yMap.set('isRunning', false);
        yMap.set('stdout', result.stdout || '');
        yMap.set('stderr', result.stderr || '');
        yMap.set('compilationError', result.compilationError || '');
        yMap.set('executionTime', result.executionTime ?? 0);
      });
    } catch (err: any) {
      console.error('Error executing code:', err);
      yDoc.transact(() => {
        yMap.set('isRunning', false);
        yMap.set('compilationError', `Network or Server Error: ${err.message}`);
      });
    }
  };

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

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const prevLanguageRef = useRef(language);

  useEffect(() => {
    const yDoc = yDocRef.current;
    if (!yDoc || !editor) {
      prevLanguageRef.current = language;
      return;
    }

    const yText = yDoc.getText('monaco');
    const currentText = yText.toString();
    const prevLang = prevLanguageRef.current;
    prevLanguageRef.current = language;

    if (prevLang === language) return;

    const prevTemplate = TEMPLATES[prevLang as keyof typeof TEMPLATES] || '';
    const newTemplate = TEMPLATES[language as keyof typeof TEMPLATES] || '';

    const normalize = (str: string) => str.replace(/\r\n/g, '\n').trim();

    if (normalize(currentText) === '' || normalize(currentText) === normalize(prevTemplate)) {
      editor.setValue(newTemplate);
    }
  }, [language, editor]);

  useEffect(() => {
    if (!editor) return;

    // Create a local Y.Doc instance
    const yDoc = new Y.Doc();
    // Get the shared text type
    const yText = yDoc.getText('monaco');
    const model = editor.getModel();

    if (!model) return;

    // Connect to Yjs sync server using WebSocket provider
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:1234';
    const provider = new WebsocketProvider(
      wsUrl,
      'test-room-1',
      yDoc
    );

    provider.on('status', (event: { status: string }) => {
      setIsConnected(event.status === 'connected');
    });

    provider.on('sync', (isSynced: boolean) => {
      if (isSynced && yText.toString().trim() === '') {
        yDoc.transact(() => {
          yText.insert(0, TEMPLATES[language as keyof typeof TEMPLATES] || '');
        });
      }
    });

    yDocRef.current = yDoc;
    providerRef.current = provider;

    // Generate random name and color for current user and set it in awareness
    const localUser = getRandomPresence();
    provider.awareness.setLocalStateField('user', localUser);

    // Bind Yjs shared text to Monaco with awareness enabled for remote cursors
    const binding = new MonacoBinding(
      yText,
      model,
      new Set([editor]),
      provider.awareness
    );

    // Handle updates to the terminal logs map
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
    handleMapChange();

    // Handle awareness updates to show active users and update styles dynamically
    const handleAwarenessChange = () => {
      const states = Array.from(provider.awareness.getStates());
      
      // Update local state list of active users
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

      // Generate dynamic CSS styles for active clients' carets and selections
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
    handleAwarenessChange();

    console.log('Bound Monaco Editor with synced terminal logs to Yjs WebSocket Provider');

    // Cleanup binding, provider and styles when unmounted
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

  return (
    <div className="editor-container-inner" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      {!isConnected && (
        <div className="reconnecting-banner" style={{ backgroundColor: '#ef4444', color: 'white', padding: '8px', textAlign: 'center', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold' }}>
          Connection lost. Reconnecting...
        </div>
      )}
      <div className="active-users-bar">
        <div className="active-users-title-container">
          <span className="active-users-title">Active Collaborators</span>
          <span className="active-users-count">{activeUsers.length} online</span>
        </div>
        <div className="active-users-list">
          {activeUsers.map((user) => (
            <div 
              key={user.clientId} 
              className={`user-pill ${user.isSelf ? 'self' : ''}`}
              style={{ '--user-color': user.color } as React.CSSProperties}
            >
              <span className="user-dot"></span>
              <span className="user-name">{user.name} {user.isSelf ? '(You)' : ''}</span>
            </div>
          ))}
        </div>
        <div className="editor-actions">
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)}
            style={{ marginRight: '8px', padding: '6px', borderRadius: '4px', backgroundColor: '#1f2937', color: '#f3f4f6', border: '1px solid #374151', fontFamily: "'Outfit', sans-serif", cursor: 'pointer' }}
          >
            <option value="cpp">C++</option>
            <option value="javascript">JS</option>
            <option value="python">Python</option>
          </select>
          <button 
            className="invite-btn"
            onClick={handleCopyLink}
            style={{ marginRight: '8px', padding: '6px 12px', borderRadius: '4px', backgroundColor: '#374151', color: '#f3f4f6', border: 'none', cursor: 'pointer', fontFamily: "'Outfit', sans-serif", fontSize: '13px', fontWeight: 500, transition: 'background-color 0.2s' }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#374151'}
          >
            {linkCopied ? 'Copied!' : 'Copy Invite Link'}
          </button>
          <button 
            className="run-btn" 
            onClick={handleRunCode}
            disabled={terminalState.isRunning || !isConnected}
          >
            <PlayIcon />
            {terminalState.isRunning ? 'Executing...' : 'Run Code'}
          </button>
        </div>
      </div>
      <div className="workspace-split" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '16px', minHeight: 0 }}>
        <div className="editor-wrapper" style={{ flex: 1.6, minHeight: 0 }}>
          <Editor
            height="100%"
            width="100%"
            language={language}
            defaultValue={TEMPLATES[language as keyof typeof TEMPLATES]}
            theme="vs-dark"
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
        <div className="bottom-panels" style={{ display: 'flex', gap: '16px', flex: 1, minHeight: '180px', maxHeight: '300px' }}>
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
          
          <div className="terminal-panel" style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
            <div className="terminal-header">
              <div className="terminal-title-container">
                <span className="terminal-title">Terminal Output</span>
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
              <button className="clear-btn" onClick={handleClearTerminal} title="Clear terminal output for all users">
                <TrashIcon />
                Clear
              </button>
            </div>
            <div className="terminal-body" style={{ flex: 1, overflowY: 'auto' }}>
              {terminalState.compilationError && (
                <div className="terminal-line error">{terminalState.compilationError}</div>
              )}
              {terminalState.stderr && (
                <div className="terminal-line error">{terminalState.stderr}</div>
              )}
              {terminalState.stdout && (
                <pre className="terminal-stdout">{terminalState.stdout}</pre>
              )}
              {!terminalState.isRunning && !terminalState.compilationError && !terminalState.stderr && !terminalState.stdout && (
                <div className="terminal-placeholder">
                  $ Click "Run Code" above to execute C++ code collaboratively...
                </div>
              )}
              {terminalState.isRunning && !terminalState.stdout && !terminalState.compilationError && !terminalState.stderr && (
                <div className="terminal-line loading">Waiting for output...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
