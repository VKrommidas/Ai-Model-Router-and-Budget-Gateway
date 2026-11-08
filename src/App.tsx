import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend 
} from 'recharts';
import { 
  Activity, AlertCircle, Bot, CheckCircle2, ChevronRight, 
  Coins, Database, History, LayoutDashboard, Send, Settings, 
  ShieldAlert, Sparkles, Zap, Power, RefreshCw, Cpu, Globe, MonitorDot
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface GlobalConfig {
  monthlyBudget: number;
  totalSpend: number;
  currency: string;
  providers: Record<string, { enabled: boolean; priority: number; cheapModel: string; expertModel: string; healthy: boolean; lastChecked: string }>;
  failoverOrder: string[];
  timeoutMs: number;
  maxRetries: number;
  uptimeSeconds?: number;
  difficultyThreshold?: number;
}

function formatCost(cost: number | undefined): string {
  if (cost === undefined || isNaN(cost)) return '$0.00';
  if (cost > 0 && cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return 'Just started';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface Log {
  id: string;
  timestamp: string;
  prompt: string;
  response: string;
  model: string;
  provider: string;
  cost: number;
  difficulty: number;
  classification: string;
  duration: number;
  cached?: boolean;
}

const PROVIDER_COLORS = {
  gemini: '#D44D26',
  openai: '#10A37F',
  claude: '#D97757',
  ollama: '#3B82F6',
  cache: '#10B981'
};

export default function App() {
  const [config, setConfig] = useState<GlobalConfig | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthResults, setHealthResults] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'dashboard' | 'playground' | 'logs' | 'controls'>('dashboard');
  const [lastResult, setLastResult] = useState<any>(null);
  const [routeError, setRouteError] = useState<{ message: string; status: number } | null>(null);

  // Global Config Form State
  const [budgetInput, setBudgetInput] = useState<string>('');
  const [timeoutInput, setTimeoutInput] = useState<string>('');
  const [retriesInput, setRetriesInput] = useState<string>('');
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaveMsg, setConfigSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [providerEdits, setProviderEdits] = useState<Record<string, { cheapModel: string; expertModel: string }>>({});
  const [savingProvider, setSavingProvider] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [configRes, logsRes] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/logs')
      ]);
      const configData = await configRes.json();
      const logsData = await logsRes.json();
      setConfig(configData);
      setLogs(logsData);

      setBudgetInput(prev => (prev === '' ? String(configData.monthlyBudget ?? 50) : prev));
      setTimeoutInput(prev => (prev === '' ? String((configData.timeoutMs || 60000) / 1000) : prev));
      setRetriesInput(prev => (prev === '' ? String(configData.maxRetries ?? 2) : prev));

      if (configData.providers) {
        setProviderEdits(prev => {
          const next = { ...prev };
          for (const [name, p] of Object.entries(configData.providers as Record<string, any>)) {
            if (!next[name]) {
              next[name] = { cheapModel: p.cheapModel, expertModel: p.expertModel };
            }
          }
          return next;
        });
      }
    } catch (error) {
      console.error('Fetch error:', error);
    }
  };

  const handleSaveGlobalConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    setConfigSaveMsg(null);
    try {
      const budgetNum = parseFloat(budgetInput);
      const timeoutSec = parseInt(timeoutInput);
      const retriesNum = parseInt(retriesInput);

      if (isNaN(budgetNum) || isNaN(timeoutSec) || isNaN(retriesNum)) {
        setConfigSaveMsg({ type: 'error', text: 'All fields must be valid numbers.' });
        setConfigSaving(false);
        return;
      }

      const res = await fetch('/api/config/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyBudget: budgetNum,
          timeoutMs: timeoutSec * 1000,
          maxRetries: retriesNum
        })
      });
      if (res.ok) {
        setConfigSaveMsg({ type: 'success', text: 'Parameters saved successfully!' });
        fetchData();
      } else {
        const err = await res.json();
        setConfigSaveMsg({ type: 'error', text: err.error || 'Failed to update.' });
      }
    } catch {
      setConfigSaveMsg({ type: 'error', text: 'Network error saving configuration.' });
    } finally {
      setConfigSaving(false);
      setTimeout(() => setConfigSaveMsg(null), 4000);
    }
  };

  const handleSaveProviderModels = async (name: string) => {
    const edits = providerEdits[name];
    if (!edits) return;
    setSavingProvider(name);
    try {
      await fetch('/api/config/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: name,
          cheapModel: edits.cheapModel,
          expertModel: edits.expertModel
        })
      });
      fetchData();
    } catch (e) {
      console.error('Failed to update provider models', e);
    } finally {
      setSavingProvider(null);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh stats
    return () => clearInterval(interval);
  }, []);

  const handleRunHealthCheck = async () => {
    setHealthChecking(true);
    try {
      const res = await fetch('/api/health', { method: 'POST' });
      const data = await res.json();
      setHealthResults(data);
      fetchData();
    } catch (error) {
      console.error('Health check failed:', error);
    } finally {
      setHealthChecking(false);
    }
  };

  const handleToggleProvider = async (name: string, enabled: boolean) => {
    try {
      await fetch('/api/config/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: name, enabled: !enabled })
      });
      fetchData();
    } catch (error) {
      console.error('Failed to toggle provider', error);
    }
  };

  const handleRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setRouteError(null);
    setLastResult(null);
    try {
      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (!res.ok) {
        setRouteError({ message: data.error || 'An unknown error occurred.', status: res.status });
      } else {
        setLastResult(data);
        setPrompt('');
        fetchData();
      }
    } catch (error) {
      console.error('Routing error:', error);
      setRouteError({ message: 'Failed to connect to the gateway. Is the server running?', status: 0 });
    } finally {
      setLoading(false);
    }
  };

  const getProviderColor = (name: string) => PROVIDER_COLORS[name as keyof typeof PROVIDER_COLORS] || '#1A1A1A';

  const providerStats = logs.reduce((acc: any, log) => {
    const prov = (log.provider || '').toLowerCase().trim();
    if (prov && prov !== 'undefined' && prov !== 'null') {
      acc[prov] = (acc[prov] || 0) + 1;
    }
    return acc;
  }, {});

  const totalValidLogs = (Object.values(providerStats).reduce((a: number, b: any) => a + Number(b), 0) as number) || logs.length || 1;
  const pieData = Object.entries(providerStats).map(([name, value]) => ({ name, value: value as number }));

  const qualityScore = logs.length > 0
    ? ((logs.filter(l => l.response && !l.response.toLowerCase().includes('error')).length / logs.length) * 100).toFixed(1)
    : '100.0';
  
  const dailySpendData = logs.reduce((acc: any, log) => {
    const date = new Date(log.timestamp).toLocaleDateString();
    acc[date] = (acc[date] || 0) + log.cost;
    return acc;
  }, {});

  const chartData = Object.entries(dailySpendData)
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .map(([date, spend]) => ({ date, spend }));

  const COLORS = ['#1A1A1A', '#D44D26', '#666666'];

  const budgetUsage = ((config?.totalSpend || 0) / (config?.monthlyBudget || 1) * 100);

  return (
    <div className="min-h-screen bg-[#F9F8F6] text-[#1A1A1A] font-sans selection:bg-[#D44D26] selection:text-white">
      <div className="max-w-[1440px] mx-auto px-8 md:px-12 py-8 flex flex-col min-h-screen">
        
        {/* Editorial Header */}
        <header className="border-b-2 border-[#1A1A1A] pb-8 mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase mb-3 text-[#666]">
              Architectural Series // Multi-Provider AI Gateway
            </span>
            <h1 className="text-6xl md:text-8xl font-serif leading-none lowercase tracking-tighter">
              AI Gateway <span className="text-3xl md:text-4xl align-top italic font-normal tracking-normal text-[#D44D26]">Gateway</span>
            </h1>
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            <p className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D44D26] animate-pulse" />
              Status: Operational
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-widest opacity-60">
              System Uptime: {formatUptime(config?.uptimeSeconds)}
            </p>
            <div className="mt-4 flex gap-8">
              <NavButton label="01 / Overview" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
              <NavButton label="02 / Playground" active={activeTab === 'playground'} onClick={() => setActiveTab('playground')} />
              <NavButton label="03 / Archive" active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
              <NavButton label="04 / Controls" active={activeTab === 'controls'} onClick={() => setActiveTab('controls')} />
            </div>
          </div>
        </header>

        {/* Main Content Grid */}
        <div className="grid grid-cols-12 gap-12 flex-grow">
          
          {/* Dashboard View */}
          {activeTab === 'dashboard' && (
            <>
              {/* Left Column: Logic & Policy */}
              <aside className="col-span-12 lg:col-span-3 flex flex-col border-r border-[#1A1A1A]/10 pr-8 space-y-12">
                <div>
                  <h2 className="text-[11px] font-bold uppercase tracking-widest mb-8 py-2 border-y border-[#1A1A1A]/10">01 / Routing Policy</h2>
                  <p className="text-base leading-relaxed mb-8 font-serif italic text-[#444]">
                    Intelligence-weighted distribution prioritizing cost-efficiency without compromising query accuracy.
                  </p>
                  <div className="space-y-5">
                    <PolicyRow label="Difficulty Threshold" value={config?.difficultyThreshold ? config.difficultyThreshold.toFixed(2) : "0.60"} />
                    <PolicyRow label="Failover Order" value={config?.failoverOrder?.join(' → ') || 'None'} />
                    <PolicyRow 
                      label="Aggressive Frugality" 
                      value={budgetUsage > 90 ? "ACTIVE" : "STANDBY"} 
                      highlight={budgetUsage > 90} 
                    />
                  </div>
                </div>
                
                <div className="bg-[#1A1A1A] text-white p-6 rounded-sm mt-auto">
                  <p className="text-[9px] uppercase tracking-[0.2em] mb-3 opacity-60 font-bold">System Alert</p>
                  <p className="text-xs leading-relaxed font-serif italic">
                    {budgetUsage > 90 
                      ? `Monthly budget ceiling approaching (${budgetUsage.toFixed(0)}%). Throttling Expert Tier requests to preserve resources.`
                      : "System operating within normal parameters. Capacity allocation optimized."
                    }
                  </p>
                </div>
              </aside>

              {/* Center Column: Budget Visualization */}
              <section className="col-span-12 lg:col-span-6 flex flex-col space-y-12">
                <h2 className="text-[11px] font-bold uppercase tracking-widest mb-2 py-2 border-y border-[#1A1A1A]/10">02 / Financial Oversight</h2>
                
                <div className="flex-grow flex flex-col justify-center">
                  <div className="mb-16 relative">
                    <div className="flex justify-between items-end mb-4 px-1">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-1">Total Expenditure</span>
                        <span className="text-7xl font-serif tracking-tighter leading-none">{formatCost(config?.totalSpend)}</span>
                      </div>
                      <span className="text-xl font-serif italic text-[#666]">of {formatCost(config?.monthlyBudget)} Limit</span>
                    </div>
                    <div className="w-full h-14 bg-[#1A1A1A]/5 relative flex items-center p-1.5 overflow-hidden">
                      <div 
                        className="bg-[#1A1A1A] h-full transition-all duration-1000 ease-in-out" 
                        style={{ width: `${Math.min(100, budgetUsage)}%` }}
                      ></div>
                      <div 
                        className="absolute top-0 h-full w-0.5 bg-[#D44D26] z-10" 
                        style={{ left: '90%' }}
                      ></div>
                    </div>
                    <div className="mt-3 flex justify-between text-[10px] uppercase font-bold tracking-tighter text-[#666]">
                      <span>0.00 USD</span>
                      <span className="text-[#D44D26]">Frugality Shift (90%)</span>
                      <span>{formatCost(config?.monthlyBudget)} MAX</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-12 pt-8 border-t border-[#1A1A1A]/10">
                    <div>
                      <h3 className="text-[10px] font-bold uppercase mb-4 opacity-50 tracking-widest">Efficiency Heatmap (Recent)</h3>
                      <div className="grid grid-cols-4 gap-1 h-32">
                        {logs.slice(0, 16).concat(Array(Math.max(0, 16 - logs.length)).fill(null)).map((log, i) => (
                          <div 
                            key={i} 
                            title={log ? `${log.provider} - $${log.cost}` : 'No data'}
                            className="transition-colors hover:border hover:border-[#1A1A1A] cursor-help"
                            style={{ 
                              backgroundColor: !log ? 'rgba(26,26,26, 0.05)' : getProviderColor(log.provider),
                              opacity: log ? 0.3 + (log.difficulty * 0.7) : 1
                            }} 
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col justify-end">
                      <p className="text-sm leading-relaxed text-[#444] font-serif italic">
                        <strong className="text-[#1A1A1A] block not-italic mb-2 uppercase text-[10px] tracking-widest">Analysis Note</strong>
                        High-complexity queries are currently costing an average of ${(config?.totalSpend && logs.length ? config.totalSpend/logs.length : 0).toFixed(4)} per request. {budgetUsage > 90 ? "Aggressive fallback mechanisms engaged." : "Capacity available for expert tier calls."}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Right Column: Provider Distribution */}
              <section className="col-span-12 lg:col-span-3 flex flex-col border-l border-[#1A1A1A]/10 pl-8 space-y-12">
                <h2 className="text-[11px] font-bold uppercase tracking-widest mb-2 py-2 border-y border-[#1A1A1A]/10">03 / Load Distribution</h2>
                
                <div className="space-y-10">
                  {pieData.sort((a, b) => b.value - a.value).map((prov, idx) => {
                    const percentage = Math.round((prov.value / totalValidLogs) * 100);
                    return (
                      <div key={prov.name} className="group">
                        <div className="flex justify-between items-baseline mb-2">
                          <h3 className="font-serif text-2xl italic tracking-tight">{prov.name.charAt(0).toUpperCase() + prov.name.slice(1)}</h3>
                          <span className="text-sm font-mono font-bold">{percentage}%</span>
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#666] mb-3">
                          Provider Endpoint
                        </p>
                        <div className="h-[2px] w-full bg-[#1A1A1A]/5">
                          <div 
                            className="h-full transition-all duration-1000"
                            style={{ backgroundColor: getProviderColor(prov.name), width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-auto">
                  <div className="p-8 border-2 border-[#1A1A1A] text-center bg-white">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2 text-[#666]">Quality Score</p>
                    <p className="text-5xl font-serif tracking-tighter">{qualityScore}<span className="text-2xl font-normal opacity-50">%</span></p>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* Playground View */}
          {activeTab === 'playground' && (
            <div className="col-span-12 max-w-4xl mx-auto w-full space-y-12 py-12">
              <div>
                <h2 className="text-[11px] font-bold uppercase tracking-widest mb-8 py-2 border-y border-[#1A1A1A]/10 inline-block w-full">02 / Interaction Portal</h2>
                <form onSubmit={handleRoute} className="space-y-8">
                  <div className="relative group">
                    <textarea 
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Enter a query to test the routing intelligence architecture..."
                      className="w-full h-48 p-8 bg-white border border-[#1A1A1A]/20 focus:border-[#1A1A1A] outline-none transition-all resize-none font-serif text-xl italic"
                    />
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-focus-within:opacity-100 transition-opacity">
                      <Sparkles className="w-6 h-6 text-[#D44D26]" />
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#666]">
                      Cascade verification enabled // Secure endpoint validation
                    </p>
                    <button 
                      disabled={loading || !prompt.trim()}
                      className="px-12 py-4 bg-[#1A1A1A] text-white font-bold uppercase tracking-[0.2em] text-xs hover:bg-[#D44D26] transition-colors disabled:opacity-30 disabled:hover:bg-[#1A1A1A] cursor-pointer"
                    >
                      {loading ? 'Analyzing Content...' : 'Execute Route'}
                    </button>
                  </div>
                </form>
              </div>

              {routeError && (
                <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 border-2 border-red-400 bg-red-50 p-8 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-2 h-full bg-red-400" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-2">
                    {routeError.status === 402 ? 'Gateway Suspended — HTTP 402' : routeError.status === 400 ? 'Bad Request — HTTP 400' : 'Gateway Error'}
                  </p>
                  <p className="font-serif text-xl text-red-700 italic">{routeError.message}</p>
                  {routeError.status === 402 && (
                    <p className="text-xs mt-4 font-mono text-red-500">
                      Monthly budget exhausted. Increase the budget limit via the API or Controls tab to resume service.
                    </p>
                  )}
                </div>
              )}

              {lastResult && (
                <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 bg-white border border-[#1A1A1A]/10 p-12 relative overflow-hidden">
                   <div className="absolute top-0 left-0 w-2 h-full" style={{ backgroundColor: getProviderColor(lastResult.provider) }} />
                   
                   {lastResult.cached && (
                     <div className="mb-6 flex items-center gap-3 bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em]">
                       <Zap className="w-4 h-4 text-emerald-600 fill-emerald-600 animate-pulse" />
                       <span>Semantic Vector Cache Hit &mdash; Cosine Similarity &ge; 90% (Zero LLM Tokens Consumed)</span>
                     </div>
                   )}

                   <div className="flex flex-col md:flex-row justify-between mb-12 border-b border-[#1A1A1A]/10 pb-8 gap-8">
                     <div className="space-y-6">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-1">Selected Terminal</p>
                          <p className="text-3xl font-serif italic">{lastResult.cached ? 'Semantic Vector Cache' : lastResult.model}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest mt-2" style={{ color: getProviderColor(lastResult.provider) }}>
                            {lastResult.cached ? 'Vector Store (Local)' : `${lastResult.provider} Gateway`}
                          </p>
                        </div>
                        <div className="flex gap-12">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-1">Estimated Difficulty</p>
                            <p className="text-xl font-mono">{lastResult.cached ? '0% (Bypassed)' : `${(lastResult.difficulty * 100).toFixed(0)}%`}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-1">Cost Weight</p>
                            <p className={cn("text-xl font-mono", lastResult.cached ? "text-emerald-600 font-bold" : "text-[#D44D26]")}>
                              {lastResult.cached ? '$0.00000 (Free)' : formatCost(lastResult.cost)}
                            </p>
                          </div>
                        </div>
                     </div>
                     <div className="text-right flex flex-col justify-end">
                       <p className="text-[10px] font-bold tracking-widest uppercase py-1 border-y border-[#1A1A1A]/10 mb-4 inline-block">
                         Route Classification: {lastResult.cached ? 'Vector Cache Hit' : lastResult.classification}
                       </p>
                       <p className="text-sm font-mono text-[#999]">Latency: {lastResult.duration}ms</p>
                     </div>
                   </div>
                   <div className="font-serif text-lg leading-relaxed text-[#1A1A1A] first-letter:text-5xl first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:mt-1">
                     {lastResult.response}
                   </div>
                </div>
              )}
            </div>
          )}

          {/* Logs View */}
          {activeTab === 'logs' && (
            <div className="col-span-12 py-12">
              <h2 className="text-[11px] font-bold uppercase tracking-widest mb-8 py-2 border-y border-[#1A1A1A]/10 w-full">03 / Historical Archive</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse border-b border-[#1A1A1A]/10">
                  <thead>
                    <tr className="border-b-2 border-[#1A1A1A]">
                      <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A]">Index / Time</th>
                      <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A]">Input Fragment</th>
                      <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A]">Architecture & Providers</th>
                      <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A]">Cost Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1A1A1A]/10 font-serif">
                    {logs.map((log, idx) => (
                      <tr key={log.id} className="hover:bg-white transition-colors group italic">
                        <td className="px-6 py-6 w-32">
                          <div className="text-xs font-mono not-italic text-[#666]">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                          </div>
                        </td>
                        <td className="px-6 py-6 max-w-md">
                          <div className="text-base font-medium truncate">{log.prompt}</div>
                        </td>
                        <td className="px-6 py-6">
                          <div className="flex items-center gap-3">
                              <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: getProviderColor(log.provider) }} />
                             <span className="text-sm font-bold uppercase tracking-widest not-italic">
                               {log.cached ? '⚡ SEMANTIC CACHE' : `${log.provider} / ${log.model}`}
                             </span>
                          </div>
                        </td>
                        <td className="px-6 py-6 text-right">
                          <div className={cn("text-lg font-mono font-bold not-italic", log.cached ? "text-emerald-600" : "text-[#1A1A1A]")}>
                            {log.cached ? '$0.0000 (Free)' : formatCost(log.cost)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Controls View */}
          {activeTab === 'controls' && (
            <div className="col-span-12 py-12 space-y-12">
              <h2 className="text-[11px] font-bold uppercase tracking-widest py-2 border-y border-[#1A1A1A]/10 w-full">04 / Provider Controls & Infra</h2>
              
              {/* Global Gateway Parameters Card */}
              <div className="bg-white border border-[#1A1A1A]/10 p-8 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-6 border-b border-[#1A1A1A]/10">
                  <div>
                    <h3 className="font-serif text-2xl italic">Global FinOps & Runtime Parameters</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#666] mt-1">
                      Real-time circuit-breaking limits and failover parameters
                    </p>
                  </div>
                  {configSaveMsg && (
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 transition-all",
                      configSaveMsg.type === 'success' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                      {configSaveMsg.text}
                    </span>
                  )}
                </div>

                <form onSubmit={handleSaveGlobalConfig} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#666] mb-2">
                      Monthly Budget (USD)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.0001"
                      value={budgetInput}
                      onChange={(e) => setBudgetInput(e.target.value)}
                      className="w-full font-mono text-sm border border-[#1A1A1A]/20 p-2.5 outline-none focus:border-[#1A1A1A]"
                      placeholder="e.g. 50.00"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#666] mb-2">
                      Request Timeout (Seconds)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="5"
                      max="300"
                      value={timeoutInput}
                      onChange={(e) => setTimeoutInput(e.target.value)}
                      className="w-full font-mono text-sm border border-[#1A1A1A]/20 p-2.5 outline-none focus:border-[#1A1A1A]"
                      placeholder="e.g. 60"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#666] mb-2">
                      Max Retries (Per Provider)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="5"
                      value={retriesInput}
                      onChange={(e) => setRetriesInput(e.target.value)}
                      className="w-full font-mono text-sm border border-[#1A1A1A]/20 p-2.5 outline-none focus:border-[#1A1A1A]"
                      placeholder="e.g. 2"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={configSaving}
                    className="w-full bg-[#1A1A1A] text-white py-3 text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-[#D44D26] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {configSaving ? 'Saving...' : 'Save Parameters'}
                  </button>
                </form>
              </div>

              {/* Providers Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {config && Object.entries(config.providers).map(([name, p]: [string, any]) => (
                  <div key={name} className="border border-[#1A1A1A]/10 p-6 bg-white shadow-sm flex flex-col group relative overflow-hidden">
                    <div className="absolute top-0 left-0 h-1 w-full" style={{ backgroundColor: getProviderColor(name) }} />
                    <h3 className="text-xl font-serif italic mb-4 flex items-center justify-between">
                      <span>{name.toUpperCase()}</span>
                      <span 
                         className={cn("w-2.5 h-2.5 rounded-full", p.healthy ? "bg-green-500" : "bg-red-500")} 
                         title={p.healthy ? "Healthy" : "Unhealthy"}
                      ></span>
                    </h3>
                    <div className="text-[10px] uppercase font-bold tracking-widest text-[#666] mb-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span>Status</span>
                        <span className={cn("px-2 py-0.5 text-[9px] font-bold tracking-widest", p.enabled ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-500")}>
                          {p.enabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Priority</span>
                        <span className="text-[#1A1A1A] font-mono">{p.priority}</span>
                      </div>
                      <div>
                        <span className="block mb-1">Cheap Model</span>
                        <input
                          type="text"
                          value={providerEdits[name]?.cheapModel ?? p.cheapModel}
                          onChange={(e) => setProviderEdits(prev => ({
                            ...prev,
                            [name]: { ...prev[name], cheapModel: e.target.value, expertModel: prev[name]?.expertModel ?? p.expertModel }
                          }))}
                          className="w-full font-mono text-xs border border-[#1A1A1A]/20 px-2 py-1 outline-none focus:border-[#1A1A1A]"
                        />
                      </div>
                      <div>
                        <span className="block mb-1">Expert Model</span>
                        <input
                          type="text"
                          value={providerEdits[name]?.expertModel ?? p.expertModel}
                          onChange={(e) => setProviderEdits(prev => ({
                            ...prev,
                            [name]: { cheapModel: prev[name]?.cheapModel ?? p.cheapModel, expertModel: e.target.value }
                          }))}
                          className="w-full font-mono text-xs border border-[#1A1A1A]/20 px-2 py-1 outline-none focus:border-[#1A1A1A]"
                        />
                      </div>
                    </div>
                    
                    <div className="mt-auto space-y-2">
                      <button
                        onClick={() => handleSaveProviderModels(name)}
                        disabled={savingProvider === name}
                        className="w-full text-[9px] font-bold py-1.5 uppercase tracking-widest border border-[#1A1A1A]/30 hover:border-[#1A1A1A] bg-white hover:bg-zinc-50 transition-colors cursor-pointer"
                      >
                        {savingProvider === name ? 'Saving...' : 'Save Models'}
                      </button>
                      <button
                        onClick={() => handleToggleProvider(name, p.enabled)}
                        className={cn(
                          "w-full text-[10px] font-bold py-2 uppercase tracking-widest cursor-pointer transition-colors",
                          p.enabled ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100" : "bg-green-50 text-green-600 border border-green-200 hover:bg-green-100"
                        )}
                      >
                        {p.enabled ? 'Disable Provider' : 'Enable Provider'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-[#1A1A1A]/10 p-8 flex items-start justify-between">
                <div>
                  <h3 className="font-serif text-2xl italic mb-2">Global Controls & Health Monitoring</h3>
                  <p className="font-serif italic text-[#666] max-w-2xl mb-6">
                    The gateway load-balances automatically according to your configured failover strategy. 
                    Fire your health check to synchronously verify all API connectivity, auth keys, and polling endpoint states. 
                    You can trigger cascading HTTP verification across every active provider simultaneously.
                  </p>
                  <div className="flex gap-4 items-center text-[10px] font-bold uppercase tracking-widest">
                    <button 
                      onClick={handleRunHealthCheck} 
                      disabled={healthChecking}
                      className="bg-[#1A1A1A] text-white px-6 py-3 cursor-pointer hover:bg-[#D44D26] transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <Zap className="w-4 h-4" />
                      {healthChecking ? 'Verifying...' : 'Verify Status Now'}
                    </button>
                  </div>
                </div>
                
                {Object.keys(healthResults).length > 0 && (
                  <div className="w-full max-w-xs border-l border-[#1A1A1A]/10 pl-8 space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-4">Results</p>
                    {Object.entries(healthResults).map(([name, healthy]) => (
                      <div key={name} className="flex justify-between items-center text-xs font-mono font-bold">
                        <span style={{color: getProviderColor(name)}}>{name}</span>
                        <span className={healthy ? "text-green-500" : "text-red-500"}>
                          {healthy ? "HEALTHY" : "FAILING"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Metric Bar */}
        <footer className="mt-auto pt-8 border-t-2 border-[#1A1A1A] grid grid-cols-2 md:grid-cols-5 gap-8 text-[10px] font-bold uppercase tracking-[0.2em] mb-4">
          <div className="flex flex-col gap-1">
            <span className="opacity-40">System Latency</span>
            <span>{logs.length > 0 ? (logs.reduce((a, b) => a + b.duration, 0) / logs.length).toFixed(0) : 0}ms Avg</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="opacity-40">Throughput</span>
            <span>{logs.length} Requests Observed</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="opacity-40">Vector Cache</span>
            <span className="text-emerald-700 font-bold">{logs.filter(l => l.cached).length} Hits (Free)</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="opacity-40">Allocation State</span>
            <span>{budgetUsage.toFixed(1)}% Bound</span>
          </div>
          <div className="flex flex-col gap-1 text-right text-[#D44D26]">
            <span className="opacity-40 text-[#1A1A1A]">Active Providers</span>
            <span>{config ? Object.values(config.providers).filter((p: any) => p.enabled).length : 0} Online</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function NavButton({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "text-[11px] font-bold uppercase tracking-[0.2em] pb-1 border-b-2 transition-all",
        active ? "border-[#D44D26] text-[#1A1A1A]" : "border-transparent text-[#666] hover:text-[#1A1A1A]"
      )}
    >
      {label}
    </button>
  );
}

function PolicyRow({ label, value, highlight = false }: { label: string, value: string, highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center text-[10px] font-bold tracking-widest uppercase">
      <span className="text-[#666]">{label}</span>
      <span className={cn("font-mono", highlight ? "bg-[#D44D26] text-white px-2 py-0.5" : "text-[#1A1A1A]")}>
        {value}
      </span>
    </div>
  );
}