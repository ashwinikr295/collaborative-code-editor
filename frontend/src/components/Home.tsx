import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Plus, ArrowRight, Code2, ShieldCheck, Cpu } from 'lucide-react';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const [inputRoomId, setInputRoomId] = useState('');
  const [error, setError] = useState('');

  const handleCreateWorkspace = () => {
    const newRoomId = uuidv4();
    navigate(`/room/${newRoomId}`);
  };

  const handleJoinWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputRoomId.trim()) {
      setError('Please enter a valid Room ID or URL');
      return;
    }

    let targetRoomId = inputRoomId.trim();

    try {
      if (targetRoomId.includes('/room/')) {
        const parts = targetRoomId.split('/room/');
        targetRoomId = parts[parts.length - 1].split('?')[0].split('#')[0];
      }
    } catch (err) {
      // Fallback if URL parsing fails
    }

    if (targetRoomId) {
      navigate(`/room/${targetRoomId}`);
    } else {
      setError('Could not extract a valid Room ID from input');
    }
  };

  return (
    <div className="home-container min-h-screen w-full flex items-center justify-center p-6 md:p-12 overflow-y-auto bg-slate-50">
      <div className="max-w-4xl w-full flex flex-col gap-12 my-auto">
        
        {/* Brand Header */}
        <div className="text-center flex flex-col items-center gap-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-600 shadow-sm">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight">
            CoEdit
          </h1>
          <p className="text-slate-600 text-base md:text-lg max-w-xl font-normal leading-relaxed">
            Real-time collaborative code editor with sandboxed execution.
          </p>
        </div>

        {/* Spacious Action Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 md:p-10 shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-stretch">
            
            {/* Left Column: Create Workspace */}
            <div className="flex flex-col justify-between gap-6 border-b md:border-b-0 md:border-r border-slate-200/80 pb-8 md:pb-0 md:pr-12">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 mb-2">Create Workspace</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Start a fresh collaborative coding session with live multi-user sync and execution capability.
                </p>
              </div>
              <button
                onClick={handleCreateWorkspace}
                className="w-full py-3.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition-all shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30 cursor-pointer mt-auto"
              >
                <Plus className="w-4 h-4" />
                <span>New Workspace</span>
              </button>
            </div>

            {/* Right Column: Join Workspace */}
            <div className="flex flex-col justify-between gap-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 mb-2">Join Workspace</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Enter an existing Room ID or paste a shared invite link to join your team session.
                </p>
              </div>
              <form onSubmit={handleJoinWorkspace} className="flex flex-col gap-4 mt-auto">
                <div className="flex flex-col gap-1.5">
                  <input
                    type="text"
                    placeholder="Enter Room ID or URL..."
                    value={inputRoomId}
                    onChange={(e) => {
                      setInputRoomId(e.target.value);
                      setError('');
                    }}
                    className={`w-full px-4 py-3 rounded-xl bg-slate-50 border ${
                      error ? 'border-rose-500' : 'border-slate-200 focus:border-indigo-500 focus:bg-white'
                    } text-slate-900 text-sm placeholder-slate-400 outline-none transition-all`}
                  />
                  {error && <span className="text-xs text-rose-500 px-1">{error}</span>}
                </div>
                <button
                  type="submit"
                  className="w-full py-3.5 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-sm flex items-center justify-center gap-2 border border-slate-200 transition-all cursor-pointer"
                >
                  <span>Join Room</span>
                  <ArrowRight className="w-4 h-4 text-slate-500" />
                </button>
              </form>
            </div>

          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
              <Code2 className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Yjs CRDT Sync</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Conflict-free data types guarantee real-time text synchronization without race conditions.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Docker Sandbox</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Code executes securely inside isolated container environments with strict resource caps.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Async Task Queue</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Powered by Redis & BullMQ to decouple compilation tasks and ensure low editor latency.
            </p>
          </div>
        </div>

        {/* Admin Dashboard Footer Link */}
        <div className="flex justify-center pt-2">
          <button 
            onClick={() => navigate('/admin')}
            className="text-xs text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1.5 font-medium cursor-pointer py-1.5 px-3.5 rounded-lg border border-slate-200 hover:border-indigo-300 bg-white shadow-sm"
          >
            <span>System Telemetry & Audit Logs &rarr;</span>
          </button>
        </div>

      </div>
    </div>
  );
};
