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
    <div className="fixed inset-y-0 right-0 w-[460px] max-w-full bg-white/95 backdrop-blur-md border-l border-slate-200 shadow-2xl z-50 flex flex-col font-sans transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="font-semibold text-base text-slate-900 flex items-center gap-2">
              CoEditAI
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 font-semibold tracking-wide">
                AI Engine
              </span>
            </h3>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
          title="Close AI Copilot"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Quick Actions */}
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 block">
            Quick Actions
          </span>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleExplain}
              disabled={loading}
              className="flex flex-col items-start gap-1.5 px-4 py-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 hover:shadow-sm text-left transition-all cursor-pointer disabled:opacity-50"
            >
              <HelpCircle className="w-5 h-5 text-indigo-600 shrink-0" />
              <span className="text-sm font-semibold text-slate-800">Explain Code</span>
              <span className="text-[11px] text-slate-500 leading-snug">Break down logic line by line</span>
            </button>
            <button
              onClick={() => handleSendPrompt("Optimize the code for time and space complexity O(n).")}
              disabled={loading}
              className="flex flex-col items-start gap-1.5 px-4 py-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 hover:shadow-sm text-left transition-all cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-5 h-5 text-amber-500 shrink-0" />
              <span className="text-sm font-semibold text-slate-800">Optimize O(n)</span>
              <span className="text-[11px] text-slate-500 leading-snug">Improve time & space complexity</span>
            </button>
            <button
              onClick={() => handleSendPrompt("Add thorough inline unit tests and comments.")}
              disabled={loading}
              className="flex flex-col items-start gap-1.5 px-4 py-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 hover:shadow-sm text-left transition-all cursor-pointer disabled:opacity-50"
            >
              <Code2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="text-sm font-semibold text-slate-800">Add Unit Tests</span>
              <span className="text-[11px] text-slate-500 leading-snug">Generate tests & comments</span>
            </button>
            <button
              onClick={() => handleSendPrompt("Refactor this code to follow clean code best practices.")}
              disabled={loading}
              className="flex flex-col items-start gap-1.5 px-4 py-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/50 hover:shadow-sm text-left transition-all cursor-pointer disabled:opacity-50"
            >
              <Play className="w-5 h-5 text-cyan-600 shrink-0" />
              <span className="text-sm font-semibold text-slate-800">Refactor</span>
              <span className="text-[11px] text-slate-500 leading-snug">Clean code best practices</span>
            </button>
          </div>
        </div>

        {/* Loading Indicator */}
        {loading && (
          <div className="p-5 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center gap-3 text-indigo-700 text-sm font-medium animate-pulse">
            <Sparkles className="w-5 h-5 text-indigo-600 spin shrink-0" />
            <span>AI is analyzing your code workspace...</span>
          </div>
        )}

        {/* Error State */}
        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* AI Response Output */}
        {aiResponse && !loading && (
          <div className="space-y-3">
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm leading-relaxed space-y-2 max-h-[50vh] overflow-y-auto">
              <div className="font-semibold text-indigo-600 mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                Response:
              </div>
              <div className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed">{aiResponse}</div>
            </div>

            {/* Apply Suggested Code Action */}
            {suggestedCode && (
              <button
                onClick={handleApplySuggestedCode}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                {applied ? (
                  <>
                    <Check className="w-5 h-5 text-emerald-300" />
                    Applied to Room Editor!
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Apply AI Code to Room Editor
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Empty State — shown when no response or loading */}
        {!aiResponse && !loading && !errorMsg && (
          <div className="flex flex-col items-center justify-center text-center py-10 px-6 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-indigo-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-1">Your AI Copilot is Ready</h4>
              <p className="text-xs text-slate-500 leading-relaxed max-w-[260px]">
                Use a Quick Action above or type a prompt below to explain, optimize, debug, or generate code.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Input Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
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
            placeholder="Ask CoEditAI to modify, debug, or write code..."
            className="flex-1 bg-white border border-slate-200 focus:border-indigo-500 outline-none text-sm text-slate-900 px-4 py-3 rounded-xl transition-all placeholder-slate-400"
          />
          <button
            type="submit"
            disabled={loading || !promptInput.trim()}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl transition-all cursor-pointer flex items-center justify-center shadow-sm"
          >
            <Send className="w-4.5 h-4.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
