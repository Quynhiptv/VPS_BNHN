
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Users, 
  TrendingUp, 
  Settings, 
  ArrowLeft, 
  Loader2, 
  Wallet, 
  Plus, 
  Trash2,
  Lock,
  PieChart as PieChartIcon,
  RefreshCcw,
  Clock,
  ShieldCheck,
  Key,
  CheckCircle2,
  AlertCircle,
  BarChart4,
  ArrowRightLeft,
  ArrowUp,
  ArrowDown,
  LayoutDashboard
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip
} from 'recharts';
import { 
  TeamSummary, 
  CustomerSummary, 
  CustomerDetail, 
  Config,
  MarketItem,
  AggregatedTradingItem
} from './types';
import { 
  getTeamSummary, 
  getCustomerSummaries, 
  getCustomerDetail,
  getMarketBoardData,
  getAggregatedTradingData,
  getUniqueTickersFromCustomers,
  cleanNumber
} from './services/googleSheets';

const DEFAULT_SPREADSHEET_ID = '1RLhYYa6thMh_60atGO4bmbXI7j21vWesThZv26ytpfc';
const ADMIN_PASSWORD = '30101986'; 

const INITIAL_GIDS = [
  '2005537397', '959399423', '1624411791', '1936773787', '1427779494',
  '1410453576', '197258654', '1934334655', '1595143066', '998019819',
  '1033472446', '1902415477', '892981804', '2006466663', '1903774197',
  '1258748022', '1981091087', '373305596', '591050791', '1809593346',
  '1142768751', '1005147614'
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ff7300', '#413ea0', '#f50057', '#00bcd4', '#ffeb3b', '#4caf50'];

const App: React.FC = () => {
  // --- STATE ---
  const [config, setConfig] = useState<Config>(() => {
    const saved = localStorage.getItem('vps_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const combinedSheets = Array.from(new Set([...INITIAL_GIDS, ...(parsed.customerSheets || [])]));
        const accessPasswords = parsed.accessPasswords && Array.isArray(parsed.accessPasswords) && parsed.accessPasswords.length > 0 
          ? parsed.accessPasswords 
          : ['123123123'];
        // Filter out the forbidden summary sheet ID if it somehow got saved
        const filteredSheets = combinedSheets.filter(id => id !== '1181732765');
        return { ...parsed, customerSheets: filteredSheets, accessPasswords };
      } catch (e) {
        return { spreadsheetId: DEFAULT_SPREADSHEET_ID, customerSheets: INITIAL_GIDS, accessPasswords: ['123123123'] };
      }
    }
    return { spreadsheetId: DEFAULT_SPREADSHEET_ID, customerSheets: INITIAL_GIDS, accessPasswords: ['123123123'] };
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('vps_app_auth') === 'true';
  });
  const [loginPassword, setLoginPassword] = useState('');

  const [view, setView] = useState<'home' | 'detail' | 'admin' | 'market' | 'trading'>('home');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  const [teamSummary, setTeamSummary] = useState<TeamSummary | null>(null);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [marketData, setMarketData] = useState<MarketItem[]>([]);
  const [tradingData, setTradingData] = useState<AggregatedTradingItem[]>([]);
  
  // Market Board Caching
  const [cachedTickers, setCachedTickers] = useState<Set<string> | null>(null);

  // Sorting State for Market Board
  const [sortConfig, setSortConfig] = useState<{ key: keyof MarketItem; direction: 'asc' | 'desc' } | null>(null);

  // Sorting State for Customer List
  const [customerSortConfig, setCustomerSortConfig] = useState<{ key: 'name' | 'pnlPercent'; direction: 'asc' | 'desc' } | null>(null);

  // Admin State
  const [adminPasswordInput, setAdminPasswordInput] = useState(''); 
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [newAccessPassword, setNewAccessPassword] = useState('');

  const fetchData = useCallback(async (showFullLoader = true) => {
    if (showFullLoader) setLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      // Fetch details for all customers
      // Ensure we DO NOT use the summary sheet GID
      const customerGids = config.customerSheets.filter(gid => gid !== '1181732765');
      const custSummaries = await getCustomerSummaries(config.spreadsheetId, customerGids);
      setCustomers(custSummaries);

      // --- CALCULATE TEAM STATS ---
      // Sum up B2, B3, B4, B6 from all individual customers
      let totalCap = 0;   // Sum of B2
      let totalMkt = 0;   // Sum of B3
      let totalPnl = 0;   // Sum of B4 (Lãi lỗ hiện tại)
      let totalIntra = 0; // Sum of B6 (Lãi lỗ trong ngày)

      custSummaries.forEach(c => {
        totalCap += cleanNumber(c.totalCapital);
        totalMkt += cleanNumber(c.marketValue);
        totalPnl += cleanNumber(c.currentPnl);
        totalIntra += cleanNumber(c.intradayPnl);
      });

      // Calculate Team % Growth: (Market Value - Total Capital) / Total Capital * 100
      let teamPercent = 0;
      if (totalCap !== 0) {
        teamPercent = ((totalMkt - totalCap) / totalCap) * 100;
      }

      setTeamSummary({
        totalCapital: totalCap.toLocaleString('vi-VN'),
        marketValue: totalMkt.toLocaleString('vi-VN'),
        pnl: totalPnl.toLocaleString('vi-VN'),
        pnlPercent: (teamPercent > 0 ? '+' : '') + teamPercent.toFixed(2) + '%'
      });

      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message || 'Lỗi cập nhật dữ liệu từ Google Sheets.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [config]);

  const loadCustomerDetail = useCallback(async (id: string, showFullLoader = true) => {
    if (showFullLoader) setLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      const detail = await getCustomerDetail(config.spreadsheetId, id);
      setCustomerDetail(detail);
      setSelectedCustomerId(id);
      setLastUpdated(new Date());
      setView('detail');
    } catch (e: any) {
      setError(e.message || 'Lỗi tải chi tiết khách hàng.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [config.spreadsheetId]);

  const loadMarketData = useCallback(async (showFullLoader = true) => {
    // If showFullLoader is true, we treat it as a full reset/scan to get tickers
    if (showFullLoader) setLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      const customerGids = config.customerSheets.filter(gid => gid !== '1181732765');
      
      // Determine if we need to scan for tickers or use cache
      let tickersToUse = cachedTickers;
      
      if (showFullLoader || !tickersToUse) {
         tickersToUse = await getUniqueTickersFromCustomers(config.spreadsheetId, customerGids);
         setCachedTickers(tickersToUse);
      }
      
      // Fetch prices using the (now guaranteed) tickers
      const marketBoard = await getMarketBoardData(config.spreadsheetId, customerGids, tickersToUse || undefined);
      
      setMarketData(marketBoard);
      setLastUpdated(new Date());
      setView('market');
    } catch (e: any) {
      setError(e.message || 'Lỗi tải bảng điện.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [config, cachedTickers]);

  const loadTradingData = useCallback(async (showFullLoader = true) => {
    if (showFullLoader) setLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      const customerGids = config.customerSheets.filter(gid => gid !== '1181732765');
      const data = await getAggregatedTradingData(config.spreadsheetId, customerGids);
      setTradingData(data);
      setLastUpdated(new Date());
      setView('trading');
    } catch (e: any) {
      setError(e.message || 'Lỗi tải dữ liệu mua bán.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [config]);

  // Sorting Logic for Market Board
  const handleSort = (key: keyof MarketItem) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedMarketData = useMemo(() => {
    let sortableItems = [...marketData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        // Handle undefined or null values safely
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [marketData, sortConfig]);

  // Sorting Logic for Customer List
  const handleCustomerSort = (key: 'name' | 'pnlPercent') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (customerSortConfig && customerSortConfig.key === key && customerSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setCustomerSortConfig({ key, direction });
  };

  const sortedCustomers = useMemo(() => {
    let items = [...customers];
    if (customerSortConfig !== null) {
      items.sort((a, b) => {
        if (customerSortConfig.key === 'name') {
           return customerSortConfig.direction === 'asc' 
             ? a.name.localeCompare(b.name)
             : b.name.localeCompare(a.name);
        } else if (customerSortConfig.key === 'pnlPercent') {
           const valA = cleanNumber(a.pnlPercent);
           const valB = cleanNumber(b.pnlPercent);
           return customerSortConfig.direction === 'asc' ? valA - valB : valB - valA;
        }
        return 0;
      });
    }
    return items;
  }, [customers, customerSortConfig]);


  // Fetch data automatically on mount if authenticated
  useEffect(() => { 
    if (isAuthenticated) {
      fetchData(); 
    } else {
      setLoading(false);
    }
  }, [fetchData, isAuthenticated]);

  // Auto Refresh Market Data Every 3 Seconds when in 'market' view
  // This interval is fast because it uses the cached tickers list
  useEffect(() => {
    let interval: any;
    if (view === 'market' && isAuthenticated) {
       interval = setInterval(() => {
          loadMarketData(false); // Silent refresh
       }, 3000); // 3 seconds for "jumping" effect
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [view, isAuthenticated, loadMarketData]);


  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (config.accessPasswords.includes(loginPassword)) {
      setIsAuthenticated(true);
      localStorage.setItem('vps_app_auth', 'true');
      fetchData();
    } else {
      alert('Mật khẩu không đúng!');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('vps_app_auth');
    setLoginPassword('');
    setView('home');
  };

  const getPnlColor = (value: string) => {
    if (!value || value === '0' || value === '0.0' || value === '0%' || value === '-') return 'text-slate-500';
    return value.trim().startsWith('-') ? 'text-red-500' : 'text-green-500'; 
  };

  const totalIntradayPnl = useMemo(() => {
    const sum = customers.reduce((acc, curr) => {
      return acc + cleanNumber(curr.intradayPnl);
    }, 0);
    return sum.toLocaleString('vi-VN');
  }, [customers]);

  const teamDistribution = useMemo(() => {
    return customers
      .map(c => ({ name: c.name, value: cleanNumber(c.totalCapital) }))
      .filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  }, [customers]);

  const verifyAdmin = () => {
    if (adminPasswordInput === ADMIN_PASSWORD) setIsAdminAuthenticated(true);
    else alert('Mật khẩu Admin sai!');
  };

  const saveConfig = (newConfig: Config) => {
    setConfig(newConfig);
    localStorage.setItem('vps_config', JSON.stringify(newConfig));
  };

  const addAccessPassword = () => {
    if (newAccessPassword && !config.accessPasswords.includes(newAccessPassword)) {
      const updated = { ...config, accessPasswords: [...config.accessPasswords, newAccessPassword] };
      saveConfig(updated);
      setNewAccessPassword('');
    }
  };

  const removeAccessPassword = (pwd: string) => {
    if (config.accessPasswords.length <= 1) {
      alert("Phải giữ ít nhất 1 mật khẩu truy cập!");
      return;
    }
    const updated = { ...config, accessPasswords: config.accessPasswords.filter(p => p !== pwd) };
    saveConfig(updated);
  };

  // Helper to format stock price
  const formatPrice = (price: number) => {
    if (price === 0) return '-';
    // Logic: if price > 1000, divide by 1000 for display (e.g. 29500 -> 29.50)
    // If it's small (e.g. 29.5), keep it.
    const displayPrice = price > 1000 ? price / 1000 : price;
    return displayPrice.toFixed(2);
  };

  // --- LOCK SCREEN RENDER ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 font-sans">
        <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Quản lý khách hàng VPS</h1>
          <p className="text-slate-500 text-sm mb-6">Vui lòng nhập mật khẩu để truy cập</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <input 
              type="password" 
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-center text-lg tracking-widest"
              placeholder="••••••••"
              autoFocus
            />
            <button 
              type="submit" 
              className="w-full bg-blue-700 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition-transform hover:bg-blue-800"
            >
              Truy cập
            </button>
          </form>
          <div className="mt-6 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            BNHN - Nguyễn Thị Thương
          </div>
        </div>
      </div>
    );
  }

  if (loading && view === 'home') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-500 text-sm font-medium">Đang đồng bộ hệ thống VPS...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50 text-slate-900 font-sans">
      <header className="bg-blue-700 text-white sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 w-full">
          <div className="flex justify-between items-center gap-2">
            {view !== 'home' && view !== 'market' && view !== 'trading' ? (
              <button onClick={() => { setView('home'); setError(null); }} className="p-2 active:scale-95 hover:bg-white/10 rounded-full transition-colors"><ArrowLeft className="w-6 h-6" /></button>
            ) : (
              <button onClick={() => {
                if(view === 'market') loadMarketData(false);
                else if(view === 'trading') loadTradingData(false);
                else fetchData(false);
              }} className={`p-2 hover:bg-white/10 rounded-full transition-colors ${isRefreshing ? 'animate-spin' : ''}`}><RefreshCcw className="w-5 h-5 opacity-90" /></button>
            )}
            <h1 className="text-lg md:text-2xl font-bold truncate flex-1 text-center md:text-left px-2">
              {view === 'detail' && customerDetail?.name ? customerDetail.name : 
               view === 'market' ? 'Bảng điện danh mục' : 
               view === 'trading' ? 'Mua Bán Trading' :
               'Quản lý khách hàng VPS'}
            </h1>
            <div className="flex items-center gap-1">
              <button onClick={() => setView('admin')} className="p-2 hover:bg-white/10 rounded-full transition-colors"><Settings className="w-6 h-6 opacity-90" /></button>
            </div>
          </div>
          <div className="flex justify-between items-center mt-2 text-[10px] md:text-xs font-medium text-blue-100 max-w-7xl mx-auto px-1">
            <span className="uppercase tracking-wide opacity-80">BNHN - Nguyễn Thị Thương</span>
            <span className="flex items-center gap-1.5 bg-white/10 px-2.5 py-0.5 rounded-full backdrop-blur-sm shadow-sm"><Clock className="w-3 h-3" /> {lastUpdated.toLocaleTimeString()}</span>
          </div>
        </div>
      </header>

      {/* VIEW SWITCHER TABS (Modern Segmented Control) */}
      {(view === 'home' || view === 'market' || view === 'trading') && (
        <div className="bg-white border-b border-slate-200 sticky top-[72px] md:top-[88px] z-40 shadow-sm">
           <div className="max-w-7xl mx-auto px-4 py-3 overflow-x-auto no-scrollbar">
             <div className="flex p-1 bg-slate-100 rounded-xl min-w-max md:w-fit mx-auto">
                <button 
                  onClick={() => { setView('home'); fetchData(); }}
                  className={`flex-1 px-4 md:px-8 py-2 text-sm font-bold flex items-center justify-center gap-2 rounded-lg transition-all whitespace-nowrap ${view === 'home' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <Users className="w-4 h-4" /> Danh sách khách hàng
                </button>
                <button 
                  onClick={() => loadMarketData()}
                  className={`flex-1 px-4 md:px-8 py-2 text-sm font-bold flex items-center justify-center gap-2 rounded-lg transition-all whitespace-nowrap ${view === 'market' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <BarChart4 className="w-4 h-4" /> Bảng điện
                </button>
                <button 
                  onClick={() => loadTradingData()}
                  className={`flex-1 px-4 md:px-8 py-2 text-sm font-bold flex items-center justify-center gap-2 rounded-lg transition-all whitespace-nowrap ${view === 'trading' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <ArrowRightLeft className="w-4 h-4" /> Trading T0
                </button>
             </div>
           </div>
        </div>
      )}

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 overflow-y-auto pb-10">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-6 border border-red-100 flex items-start gap-3 shadow-sm">
             <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
             <pre className="whitespace-pre-wrap font-sans font-medium">{error}</pre>
          </div>
        )}

        {view === 'home' && (
          <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
            {/* Team Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-5">
              {[
                { label: 'Tổng vốn Team', value: teamSummary?.totalCapital, pnl: false, icon: Wallet },
                { label: 'Giá trị thị trường', value: teamSummary?.marketValue, pnl: false, icon: PieChartIcon },
                { label: 'Lãi lỗ hiện tại', value: teamSummary?.pnl, pnl: true, icon: TrendingUp },
                { label: 'Lãi lỗ trong ngày', value: totalIntradayPnl, pnl: true, icon: Clock },
                { label: '% Lãi lỗ', value: teamSummary?.pnlPercent, pnl: true, icon: BarChart4 }
              ].map((c, i) => (
                <div key={i} className={`bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:-translate-y-1 transition-all duration-300 ${i === 3 || i === 4 ? 'md:col-span-1' : ''}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-1.5 rounded-lg ${c.pnl ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                      <c.icon className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-[11px] md:text-xs font-bold text-slate-500 uppercase tracking-wide">{c.label}</p>
                  </div>
                  <p className={`text-sm md:text-xl font-black ${c.pnl ? getPnlColor(c.value || '') : 'text-slate-800'} break-words tracking-tight`}>{c.value || '0'}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Chart */}
              <section className="lg:col-span-1 bg-white p-4 md:p-6 rounded-2xl shadow-md border border-slate-100 flex flex-col h-fit">
                <h2 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <PieChartIcon className="w-5 h-5 text-purple-600" /> Tỷ trọng vốn
                </h2>
                <div className="flex-1 min-h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={teamDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius="80%"
                        fill="#8884d8"
                        paddingAngle={3}
                        cornerRadius={4}
                      >
                        {teamDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px'}} 
                        itemStyle={{fontSize: '13px', fontWeight: 600, color: '#334155'}} 
                        formatter={(value: number) => value.toLocaleString('vi-VN')}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Customer List */}
              <section className="lg:col-span-2 bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden flex flex-col">
                <div className="p-4 md:p-6 border-b border-slate-100 bg-white">
                   <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                     <Users className="w-5 h-5 text-blue-600" /> Danh sách khách hàng
                   </h2>
                </div>
                {/* Sorting Headers */}
                <div className="flex justify-between items-center px-4 md:px-6 py-3 text-xs font-bold text-slate-500 bg-slate-50/80 border-b border-slate-100">
                   <div 
                     onClick={() => handleCustomerSort('name')} 
                     className="cursor-pointer flex items-center gap-1.5 hover:text-blue-600 transition-colors select-none group"
                   >
                     Tên Khách Hàng
                     {customerSortConfig?.key === 'name' && (
                        customerSortConfig.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                     )}
                     {customerSortConfig?.key !== 'name' && <ArrowUp className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100" />}
                   </div>
                   <div 
                     onClick={() => handleCustomerSort('pnlPercent')} 
                     className="cursor-pointer flex items-center gap-1.5 hover:text-blue-600 transition-colors select-none group"
                   >
                     % Lãi/Lỗ
                     {customerSortConfig?.key === 'pnlPercent' && (
                        customerSortConfig.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                     )}
                     {customerSortConfig?.key !== 'pnlPercent' && <ArrowUp className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100" />}
                   </div>
                </div>

                <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {sortedCustomers.map((c) => (
                    <div key={c.id} onClick={() => loadCustomerDetail(c.id)} className="flex items-center justify-between p-4 md:p-5 hover:bg-blue-50/50 active:bg-blue-50 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-4">
                         <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm shadow-inner group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors">
                           {c.name.charAt(0)}
                         </div>
                         <div>
                           <p className="font-bold text-slate-800 text-sm md:text-base group-hover:text-blue-700 transition-colors">{c.name}</p>
                           <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1"><Wallet className="w-3 h-3" /> {c.totalCapital}</p>
                         </div>
                      </div>
                      <div className={`text-right ${getPnlColor(c.pnlPercent)} bg-slate-50 px-3 py-1.5 rounded-lg group-hover:bg-white group-hover:shadow-sm transition-all`}>
                         <span className="text-sm md:text-base font-bold block">{c.pnlPercent}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
        
        {view === 'market' && (
           <div className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden animate-in fade-in duration-300">
              <div className="bg-white px-4 md:px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><BarChart4 className="w-5 h-5" /></div>
                <h3 className="font-bold text-slate-800 text-base">Danh mục tổng hợp</h3>
              </div>
              <div className="overflow-x-auto w-full">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200 select-none">
                    <tr>
                      <th 
                        className="text-left p-4 font-bold w-1/3 cursor-pointer hover:text-blue-600 transition-colors group"
                        onClick={() => handleSort('ticker')}
                      >
                        <div className="flex items-center gap-1.5">
                          Mã CK
                          {sortConfig?.key === 'ticker' && (
                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="text-right p-4 font-bold w-1/3 cursor-pointer hover:text-blue-600 transition-colors group"
                        onClick={() => handleSort('currentPrice')}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          Giá hiện tại
                          {sortConfig?.key === 'currentPrice' && (
                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="text-right p-4 font-bold w-1/3 cursor-pointer hover:text-blue-600 transition-colors group"
                        onClick={() => handleSort('change')}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          % Tăng giảm
                          {sortConfig?.key === 'change' && (
                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {sortedMarketData.map((item, idx) => {
                      const colorClass = item.change < 0 ? 'text-red-500' : item.change > 0 ? 'text-green-500' : 'text-yellow-500';
                      const bgClass = item.change > 0 ? 'bg-green-50' : item.change < 0 ? 'bg-red-50' : 'bg-yellow-50';
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className={`p-4 font-bold text-base whitespace-nowrap ${colorClass}`}>
                            <span className="bg-slate-100 px-2 py-1 rounded text-slate-800 mr-2">{item.ticker}</span>
                          </td>
                          <td className={`p-4 text-right font-mono font-bold text-base whitespace-nowrap ${colorClass}`}>
                            {formatPrice(item.currentPrice)}
                          </td>
                          <td className="p-4 text-right whitespace-nowrap">
                             <span className={`inline-block px-2.5 py-1 rounded-md font-bold text-xs ${bgClass} ${colorClass}`}>
                               {item.change > 0 ? '+' : ''}{item.change}%
                             </span>
                          </td>
                        </tr>
                      );
                    })}
                    {sortedMarketData.length === 0 && (
                       <tr><td colSpan={3} className="p-10 text-center text-slate-400 italic">Không có dữ liệu</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
           </div>
        )}

        {view === 'trading' && (
          <div className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden animate-in fade-in duration-300">
             <div className="bg-white px-4 md:px-6 py-4 border-b border-slate-100 flex items-center gap-3">
               <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><ArrowRightLeft className="w-5 h-5" /></div>
               <h3 className="font-bold text-slate-800 text-base">Hoạt động Mua Bán T+0</h3>
             </div>
             <div className="overflow-x-auto w-full">
               <table className="w-full text-sm min-w-[700px]">
                 <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200">
                   <tr>
                     <th className="text-left p-4 font-bold">Khách Hàng</th>
                     <th className="text-center p-4 font-bold">Mã CK</th>
                     <th className="text-right p-4 font-bold">Khối lượng Mua</th>
                     <th className="text-right p-4 font-bold">Khối lượng Bán</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 text-slate-700">
                   {tradingData.map((item, idx) => (
                     <tr key={idx} className="hover:bg-slate-50 transition-colors">
                       <td className="p-4 font-bold text-slate-800 whitespace-nowrap">{item.customerName}</td>
                       <td className="p-4 text-center whitespace-nowrap">
                         <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{item.ticker}</span>
                       </td>
                       <td className="p-4 text-right font-mono font-bold text-green-600 whitespace-nowrap">{item.buyVol}</td>
                       <td className="p-4 text-right font-mono font-bold text-red-500 whitespace-nowrap">{item.sellVol}</td>
                     </tr>
                   ))}
                   {tradingData.length === 0 && (
                      <tr><td colSpan={4} className="p-10 text-center text-slate-400 italic">Chưa có giao dịch T+0 nào hôm nay</td></tr>
                   )}
                 </tbody>
               </table>
             </div>
          </div>
        )}

        {view === 'detail' && customerDetail && (
          <div className="space-y-6 md:space-y-8 animate-in slide-in-from-right duration-300">
            {customerDetail.trading.length > 0 && (
              <div className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden">
                <div className="bg-gradient-to-r from-orange-50 to-white px-4 md:px-6 py-4 border-b border-orange-100 flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg text-orange-600"><ArrowRightLeft className="w-5 h-5" /></div>
                  <h3 className="font-bold text-orange-900 text-base">Giao dịch trong ngày (T0)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-100 bg-slate-50/50">
                        <th className="text-left p-3 font-semibold">Mã</th>
                        <th className="text-right p-3 font-semibold">Mua T0</th>
                        <th className="text-right p-3 font-semibold">Bán T0</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700 divide-y divide-slate-50">
                      {customerDetail.trading.map((t, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-3 font-bold whitespace-nowrap"><span className="bg-slate-100 px-2 py-0.5 rounded">{t.ticker}</span></td>
                          <td className="p-3 text-right font-mono text-green-600 font-bold whitespace-nowrap">{t.buy0}</td>
                          <td className="p-3 text-right font-mono text-red-500 font-bold whitespace-nowrap">{t.sell0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-5">
               <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold mb-2">Tổng Vốn ĐT</p>
                  <p className="text-sm md:text-lg font-black text-slate-800 break-words">{customerDetail.totalCapital}</p>
               </div>
               <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold mb-2">Thị Giá Hiện Tại</p>
                  <p className="text-sm md:text-lg font-black text-blue-600 break-words">{customerDetail.marketValue}</p>
               </div>
               
               <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold mb-2">Lãi/Lỗ Trong Ngày</p>
                  <p className={`text-lg md:text-xl font-black ${getPnlColor(customerDetail.intradayPnl)} break-words`}>
                    {customerDetail.intradayPnl}
                  </p>
               </div>
               <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold mb-2">Lãi/Lỗ Danh mục</p>
                  <p className={`text-lg md:text-xl font-black ${getPnlColor(customerDetail.portfolioPnl)} break-words`}>
                    {customerDetail.portfolioPnl}
                  </p>
               </div>

               <div className="col-span-2 md:col-span-1 bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center items-center md:items-start relative overflow-hidden">
                  <div className={`absolute right-0 top-0 p-10 opacity-5 rounded-full -mr-5 -mt-5 ${customerDetail.portfolioPercent.includes('-') ? 'bg-red-500' : 'bg-green-500'}`}></div>
                  <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold mb-2 relative z-10">% Tăng trưởng</p>
                  <p className={`text-2xl md:text-3xl font-black relative z-10 ${getPnlColor(customerDetail.portfolioPercent)}`}>
                    {customerDetail.portfolioPercent}
                  </p>
               </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden">
                <div className="bg-white px-4 md:px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><LayoutDashboard className="w-5 h-5" /></div>
                  <h3 className="font-bold text-slate-800 text-base">Danh mục đầu tư chi tiết</h3>
                </div>
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-sm min-w-[750px]">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                      <tr>
                        <th className="text-left p-4 font-semibold whitespace-nowrap">Mã CK</th>
                        <th className="text-right p-4 font-semibold whitespace-nowrap">KL Nắm giữ</th>
                        <th className="text-right p-4 font-semibold whitespace-nowrap">Giá Vốn</th>
                        <th className="text-right p-4 font-semibold whitespace-nowrap">Giá TT</th>
                        <th className="text-right p-4 font-semibold whitespace-nowrap">Lãi/Lỗ</th>
                        <th className="text-right p-4 font-semibold whitespace-nowrap">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-slate-700">
                      {customerDetail.portfolio.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-bold text-blue-600 whitespace-nowrap">
                            <span className="bg-blue-50 px-2 py-1 rounded">{item.ticker}</span>
                          </td>
                          <td className="p-4 text-right font-mono whitespace-nowrap">{item.total}</td>
                          <td className="p-4 text-right font-mono whitespace-nowrap">{item.avgPrice}</td>
                          <td className="p-4 text-right font-mono whitespace-nowrap">{item.marketPrice}</td>
                          <td className={`p-4 text-right font-mono font-bold whitespace-nowrap ${getPnlColor(item.pnl)}`}>{item.pnl}</td>
                          <td className="p-4 text-right font-mono whitespace-nowrap">
                             <span className={`inline-block px-2 py-1 rounded-md font-bold text-xs ${item.percent.includes('-') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                               {item.percent}
                             </span>
                          </td>
                        </tr>
                      ))}
                      {customerDetail.portfolio.length === 0 && (
                        <tr><td colSpan={6} className="p-10 text-center text-slate-400 italic">Chưa có cổ phiếu nào trong danh mục</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {customerDetail.weights.length > 0 && (
                <div className="lg:col-span-1 bg-white rounded-2xl shadow-md border border-slate-100 p-4 md:p-6 flex flex-col h-fit">
                   <h3 className="text-sm font-bold text-slate-800 uppercase mb-6 flex items-center gap-2 pb-3 border-b border-slate-100">
                     <PieChartIcon className="w-4 h-4 text-slate-400" /> Phân bổ danh mục
                   </h3>
                   <div className="flex-1 min-h-[250px] md:min-h-[300px]">
                     <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={customerDetail.weights}
                          dataKey="value"
                          nameKey="ticker"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          cornerRadius={4}
                        >
                          {customerDetail.weights.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => value.toLocaleString('vi-VN')} />
                      </PieChart>
                     </ResponsiveContainer>
                   </div>
                   <div className="grid grid-cols-2 gap-2 mt-4">
                      {customerDetail.weights.map((w, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor: COLORS[i % COLORS.length]}} />
                          <div className="flex flex-col overflow-hidden">
                             <span className="text-xs font-bold text-slate-700 truncate">{w.ticker}</span>
                             <span className="text-[10px] text-slate-500 font-mono">{w.percent.toFixed(1)}%</span>
                          </div>
                        </div>
                      ))}
                   </div>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'admin' && (
          <div className="animate-in fade-in zoom-in duration-300 max-w-md mx-auto pt-10">
             {!isAdminAuthenticated ? (
               <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 text-center space-y-6">
                 <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-blue-600 shadow-inner"><Lock className="w-8 h-8" /></div>
                 <div>
                    <h2 className="text-xl font-bold text-slate-800">Khu vực quản trị</h2>
                    <p className="text-slate-500 text-sm mt-1">Vui lòng xác thực quyền truy cập</p>
                 </div>
                 <input 
                   type="password" 
                   value={adminPasswordInput}
                   onChange={e => setAdminPasswordInput(e.target.value)}
                   className="w-full p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-center text-lg tracking-widest bg-slate-50"
                   placeholder="••••••••"
                 />
                 <button onClick={verifyAdmin} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold active:scale-95 transition-transform hover:bg-blue-700 shadow-lg shadow-blue-200">Đăng nhập Admin</button>
               </div>
             ) : (
               <div className="space-y-6">
                 {/* Google Sheet Config */}
                 <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-100">
                    <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2"><Settings className="w-4 h-4" /> Cấu hình hệ thống</h3>
                    <div className="mb-4">
                       <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Google Sheet ID</label>
                       <input 
                         className="w-full p-3 text-xs border border-slate-200 rounded-xl bg-slate-50 font-mono text-slate-600 focus:ring-2 focus:ring-blue-500 outline-none"
                         value={config.spreadsheetId}
                         onChange={(e) => saveConfig({...config, spreadsheetId: e.target.value})}
                       />
                    </div>
                    
                    <div className="flex justify-between items-center mb-3">
                       <div className="flex items-center gap-2">
                         <h3 className="text-sm font-bold text-slate-700">Danh sách GID Khách hàng</h3>
                         {(isRefreshing || loading) && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                       </div>
                       <button 
                         onClick={() => {
                           const newGid = prompt("Nhập GID sheet mới:");
                           if(newGid) saveConfig({...config, customerSheets: [...config.customerSheets, newGid]});
                         }}
                         className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-sm"
                       >
                         <Plus className="w-3.5 h-3.5" /> Thêm mới
                       </button>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                      {config.customerSheets.map((gid, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100 group hover:border-blue-200 transition-colors">
                          <span className="text-xs font-mono text-slate-600 truncate flex-1 mr-2 flex items-center gap-2">
                             <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[10px] font-bold border border-slate-100 text-slate-400">{idx + 1}</span>
                             {gid} 
                             {gid === '1181732765' ? <span className="text-red-500 font-bold">(Cấm)</span> : ''}
                             {customers.some(c => c.id === gid) && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          </span>
                          {gid !== '1181732765' && (
                            <button onClick={() => saveConfig({...config, customerSheets: config.customerSheets.filter(g => g !== gid)})} className="text-slate-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      ))}
                    </div>
                 </div>

                 {/* Password Management */}
                 <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-100">
                    <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                       <Key className="w-4 h-4" /> Mật khẩu truy cập Web
                    </h3>
                    <div className="flex gap-2 mb-4">
                       <input 
                         className="flex-1 p-3 text-sm border border-slate-200 rounded-xl bg-slate-50 font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                         placeholder="Nhập mật khẩu..."
                         value={newAccessPassword}
                         onChange={(e) => setNewAccessPassword(e.target.value)}
                       />
                       <button 
                         onClick={addAccessPassword}
                         className="bg-green-600 text-white px-4 rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-50 shadow-sm"
                         disabled={!newAccessPassword}
                       >
                         Thêm
                       </button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                      {config.accessPasswords.map((pwd, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <span className="text-sm font-mono text-slate-800 font-bold ml-2 tracking-wider">{pwd}</span>
                          <button onClick={() => removeAccessPassword(pwd)} className="text-slate-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                 </div>

                 <div className="space-y-3 pt-4">
                   <button 
                     onClick={() => handleLogout()}
                     className="w-full bg-slate-100 text-slate-600 py-3.5 rounded-xl font-bold active:scale-95 transition-transform hover:bg-slate-200"
                   >
                     Đăng xuất & Khóa màn hình
                   </button>
                   <button 
                     onClick={() => {
                       setView('home');
                       fetchData();
                     }}
                     className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition-transform hover:bg-blue-700"
                   >
                     Quay về trang chủ
                   </button>
                 </div>
               </div>
             )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
