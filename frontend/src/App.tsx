import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CollaborativeEditor } from './components/CollaborativeEditor';
import { Home } from './components/Home';
import { AdminDashboard } from './components/AdminDashboard';
import './App.css';

/**
 * WorkspaceWrapper Component
 * 
 * Renders the main collaborative editor component, passing down language and filename states.
 */
function WorkspaceWrapper() {
  const [language, setLanguage] = useState('cpp');
  const [filename, setFilename] = useState('main.cpp');

  useEffect(() => {
    switch (language) {
      case 'javascript':
        setFilename('script.js');
        break;
      case 'python':
        setFilename('main.py');
        break;
      case 'java':
        setFilename('Main.java');
        break;
      case 'cpp':
      default:
        setFilename('main.cpp');
        break;
    }
  }, [language]);

  return (
    <CollaborativeEditor 
      language={language} 
      setLanguage={setLanguage} 
      filename={filename} 
      setFilename={setFilename} 
    />
  );
}

/**
 * Root Router App Component
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/room/:roomId" element={<WorkspaceWrapper />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
