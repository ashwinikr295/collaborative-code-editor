import { useState, useEffect } from 'react';
import { CollaborativeEditor } from './components/CollaborativeEditor';
import './App.css';

function App() {
  const [language, setLanguage] = useState('cpp');
  const [filename, setFilename] = useState('main.cpp');

  useEffect(() => {
    switch (language) {
      case 'javascript': setFilename('script.js'); break;
      case 'python': setFilename('main.py'); break;
      case 'cpp': default: setFilename('main.cpp'); break;
    }
  }, [language]);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <div className="logo-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
          </div>
          <div className="brand-info">
            <span className="brand-name">CoEdit</span>
            <span className="badge">Online Sync</span>
          </div>
        </div>
        
        <div className="header-right">
          <div className="status-indicator">
            <span className="pulse-dot online"></span>
            <span className="status-text">Connected (test-room-1)</span>
          </div>
          <div className="user-avatars">
            <div className="avatar user-self" title="You (Editor)">Y</div>
          </div>
        </div>
      </header>

      <main className="editor-main">
        <aside className="sidebar">
          <div className="sidebar-section">
            <h3>WORKSPACE</h3>
            <ul className="file-list">
              <li className="file-item active">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <input 
                  type="text" 
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: '1px solid transparent',
                    color: '#f3f4f6',
                    outline: 'none',
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '14px',
                    width: '100%',
                    padding: '2px 4px',
                    marginLeft: '-4px',
                    borderRadius: '4px',
                    transition: 'border-color 0.2s, background-color 0.2s'
                  }}
                  onFocus={(e) => { e.currentTarget.style.backgroundColor = '#374151'; e.currentTarget.style.borderColor = '#4b5563'; }}
                  onBlur={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                />
              </li>
            </ul>
          </div>
          <div className="sidebar-info-card">
            <h4>Tech Stack Highlights</h4>
            <ul style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '13px', color: '#9ca3af', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li><strong>CRDT Sync:</strong> Yjs & WebSockets for real-time collaboration.</li>
              <li><strong>Remote Execution:</strong> Secure Docker containers with resource limits.</li>
              <li><strong>Persistence:</strong> LevelDB ensures code survives server restarts.</li>
              <li><strong>Frontend:</strong> React + Vite + Monaco Editor.</li>
            </ul>
            <div style={{ display: 'flex', gap: '16px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #374151' }}>
              <a href="https://github.com/ashwinikr295" target="_blank" rel="noopener noreferrer" style={{ color: '#f3f4f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', transition: 'color 0.2s', fontWeight: 500 }} onMouseOver={(e) => e.currentTarget.style.color = '#60a5fa'} onMouseOut={(e) => e.currentTarget.style.color = '#f3f4f6'}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .33.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                GitHub
              </a>
              <a href="https://www.linkedin.com/in/ashwini-kumar-6928a527a/" target="_blank" rel="noopener noreferrer" style={{ color: '#f3f4f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', transition: 'color 0.2s', fontWeight: 500 }} onMouseOver={(e) => e.currentTarget.style.color = '#60a5fa'} onMouseOut={(e) => e.currentTarget.style.color = '#f3f4f6'}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.924 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/></svg>
                LinkedIn
              </a>
            </div>
          </div>
        </aside>
        
        <section className="editor-container-outer">
          <CollaborativeEditor language={language} setLanguage={setLanguage} filename={filename} />
        </section>
      </main>
    </div>
  );
}

export default App;
