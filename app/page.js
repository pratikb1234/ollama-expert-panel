'use client';

import { useState } from 'react';
import { personas } from './lib/personas';

export default function Home() {
  const [question, setQuestion] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [responses, setResponses] = useState({});
  const [synthesis, setSynthesis] = useState('');
  const [synthesisState, setSynthesisState] = useState('idle'); // idle, streaming, done

  const handleSimulate = async () => {
    if (!question) return;
    setIsSimulating(true);
    setResponses({});
    setSynthesis('');
    setSynthesisState('idle');

    // Initialize blank states for all personas
    const initialResponses = {};
    personas.forEach(p => initialResponses[p.id] = '');
    setResponses(initialResponses);

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (!res.body) throw new Error('No body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n').filter(Boolean);

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (!dataStr) continue;
            
            try {
              const data = JSON.parse(dataStr);

              if (data.type === 'chunk') {
                setResponses(prev => ({
                  ...prev,
                  [data.id]: (prev[data.id] || '') + data.content
                }));
              } else if (data.type === 'synthesis_start') {
                setSynthesisState('streaming');
              } else if (data.type === 'synthesis_chunk') {
                setSynthesis(prev => prev + data.content);
              } else if (data.type === 'synthesis_done') {
                setSynthesisState('done');
              } else if (data.type === 'complete') {
                setIsSimulating(false);
              }
            } catch (e) {
              console.error('Error parsing SSE data', e);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setIsSimulating(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 p-8 font-sans selection:bg-neutral-900 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* Header */}
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-200 text-neutral-800 text-xs font-semibold uppercase tracking-widest">
            Local Ollama Engine
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900">Expert Panel Simulator</h1>
          <p className="text-lg text-neutral-600 max-w-2xl">
            Stress-test decisions using 12 concurrent open-source LLM instances running entirely on your local machine. No cloud APIs. Privacy guaranteed.
          </p>
        </header>

        {/* Input Section */}
        <section className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm space-y-4">
          <label className="block text-sm font-medium text-neutral-700">What decision are you testing?</label>
          <textarea 
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isSimulating}
            placeholder="e.g. Should we pivot our B2B SaaS from seat-based pricing to usage-based pricing?"
            className="w-full h-32 p-4 rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-none text-lg"
          />
          <div className="flex justify-end">
            <button 
              onClick={handleSimulate}
              disabled={isSimulating || !question}
              className="px-8 py-3 bg-neutral-900 text-white rounded-xl font-medium shadow-sm hover:bg-neutral-800 disabled:opacity-50 transition-colors"
            >
              {isSimulating ? 'Simulating...' : 'Run Local Simulation'}
            </button>
          </div>
        </section>

        {/* Synthesis Section */}
        {(synthesisState !== 'idle' || synthesis) && (
          <section className="bg-neutral-900 text-white p-8 rounded-2xl shadow-lg border border-neutral-800 space-y-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 animate-pulse" />
            <h2 className="text-2xl font-bold flex items-center gap-3">
              Panel Synthesis
              {synthesisState === 'streaming' && <span className="flex h-3 w-3"><span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>}
            </h2>
            <div className="whitespace-pre-wrap leading-relaxed text-lg text-neutral-300 font-medium font-serif">
              {synthesis || "Awaiting 12 expert verdicts before synthesizing..."}
            </div>
          </section>
        )}

        {/* Personas Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {personas.map((persona) => {
            const resText = responses[persona.id];
            // Simple parsing to extract VERDICT and KEY CONCERN if present
            const verdictMatch = resText?.match(/VERDICT:\s*(.*)/i);
            const concernMatch = resText?.match(/KEY CONCERN:\s*(.*)/i);
            
            let displayBody = resText || '';
            if (verdictMatch) displayBody = displayBody.replace(verdictMatch[0], '');
            if (concernMatch) displayBody = displayBody.replace(concernMatch[0], '');

            const verdict = verdictMatch ? verdictMatch[1] : null;

            return (
              <div key={persona.id} className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[400px]">
                <div className={`${persona.color} p-4 flex items-center gap-3 shrink-0`}>
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
                    {persona.avatar_initials}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">{persona.name}</h3>
                    <p className="text-xs opacity-80 line-clamp-1">{persona.role}</p>
                  </div>
                </div>
                
                <div className="p-5 flex-1 overflow-y-auto text-sm text-neutral-700 leading-relaxed space-y-3">
                  {!resText && isSimulating && (
                    <div className="flex items-center gap-2 text-neutral-400">
                      <div className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" />
                      Analyzing...
                    </div>
                  )}
                  {displayBody && <p>{displayBody}</p>}
                </div>

                {verdict && (
                  <div className="p-4 bg-neutral-50 border-t border-neutral-100 space-y-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Verdict</span>
                      <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                        verdict.toLowerCase().includes('bullish') ? 'bg-green-100 text-green-800' :
                        verdict.toLowerCase().includes('cautious') ? 'bg-yellow-100 text-yellow-800' :
                        verdict.toLowerCase().includes('skeptical') ? 'bg-red-100 text-red-800' :
                        'bg-neutral-200 text-neutral-800'
                      }`}>
                        {verdict}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>

      </div>
    </div>
  );
}
