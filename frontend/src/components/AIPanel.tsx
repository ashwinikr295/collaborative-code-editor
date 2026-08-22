import React, { useState } from 'react';
import { Sparkles, X, Send, Check, Play, Zap, HelpCircle, Code2 } from 'lucide-react';

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  getCode: () => string;
  onApplyCode: (newCode: string) => void;
  language: string;
}

export const AIPanel: React.FC<AIPanelProps> = ({
  isOpen,
  onClose,
  getCode,
  onApplyCode,
  language,
}) => {
  const [promptInput, setPromptInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [suggestedCode, setSuggestedCode] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const getApiUrl = () => {
    let apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl || apiUrl.includes('localhost')) {
      const hostname = window.location.hostname;
      const protocol = window.location.protocol;
      apiUrl = `${protocol}//${hostname}:1234`;
    }
    return apiUrl;
  };

  const handleSendPrompt = async (customPrompt?: string) => {
    const activePrompt = customPrompt || promptInput;
    if (!activePrompt.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    setApplied(false);

    const code = getCode();
    const apiUrl = getApiUrl();

    try {
      const res = await fetch(`${apiUrl}/api/ai/assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: activePrompt,
          code,
          language,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Failed to communicate with AI Assistant.');
      } else {
        setAiResponse(data.response || '');
        setSuggestedCode(data.suggestedCode || null);
      }
    } catch (err: any) {
      console.error('AI Panel Error:', err);
      setErrorMsg(err.message || 'Network error connecting to AI server.');
    } finally {
      setLoading(false);
    }
  };

  const handleExplain = async () => {
    setLoading(true);
    setErrorMsg(null);
    setApplied(false);
    setSuggestedCode(null);

    const code = getCode();
    const apiUrl = getApiUrl();

    try {
      const res = await fetch(`${apiUrl}/api/ai/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Failed to generate explanation.');
      } else {
        setAiResponse(data.explanation || '');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error connecting to AI server.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplySuggestedCode = () => {
    if (suggestedCode) {
      onApplyCode(suggestedCode);
      setApplied(true);
      setTimeout(() => setApplied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[460px] max-w-full bg-slate-950/95 backdrop-blur-md border-l border-indigo-500/20 shadow-2xl z-50 flex flex-col font-sans transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="font-semibold text-base text-slate-100 flex items-center gap-2">
              CoEditAI
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold tracking-wide">
                AI Engine
              </span>
            </h3>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          title="Close AI Copilot"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Quick Actions */}
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 block">
            Quick Actions
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleExplain}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/80 text-xs font-semibold text-slate-200 transition-all cursor-pointer disabled:opacity-50"
            >
              <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="truncate">Explain Code</span>
            </button>
            <button
              onClick={() => handleSendPrompt("Optimize the code for time and space complexity O(n).")}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/80 text-xs font-semibold text-slate-200 transition-all cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="truncate">Optimize O(n)</span>
            </button>
            <button
              onClick={() => handleSendPrompt("Add thorough inline unit tests and comments.")}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/80 text-xs font-semibold text-slate-200 transition-all cursor-pointer disabled:opacity-50"
            >
              <Code2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Add Unit Tests</span>
            </button>
            <button
              onClick={() => handleSendPrompt("Refactor this code to follow clean code best practices.")}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/80 text-xs font-semibold text-slate-200 transition-all cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="truncate">Refactor</span>
            </button>
          </div>
        </div>

        {/* Loading Indicator */}
        {loading && (
          <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/30 flex items-center gap-3 text-indigo-200 text-xs font-medium animate-pulse">
            <Sparkles className="w-4 h-4 text-indigo-400 spin shrink-0" />
            <span>AI is analyzing your code workspace...</span>
          </div>
        )}

        {/* Error State */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* AI Response Output */}
        {aiResponse && !loading && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-[13px] leading-relaxed space-y-2 max-h-[420px] overflow-y-auto">
              <div className="font-semibold text-indigo-400 mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                Response:
              </div>
              <div className="whitespace-pre-wrap font-sans text-slate-300 leading-relaxed">{aiResponse}</div>
            </div>

            {/* Apply Suggested Code Action */}
            {suggestedCode && (
              <button
                onClick={handleApplySuggestedCode}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/25 transition-all cursor-pointer"
              >
                {applied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    Applied to Room Editor!
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Apply AI Code to Room Editor
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Input Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/90">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendPrompt();
          }}
          className="flex gap-2.5"
        >
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder="Ask CoEditAI  to modify, debug, or write code..."
            className="flex-1 bg-slate-950 border border-slate-800 focus:border-indigo-500/60 outline-none text-xs text-slate-200 px-3.5 py-2.5 rounded-xl transition-all"
          />
          <button
            type="submit"
            disabled={loading || !promptInput.trim()}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-all cursor-pointer flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
