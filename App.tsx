
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
  LogOut,
  ShieldCheck
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
  Config 
} from './types';
import { 
  getTeamSummary, 
  getCustomerSummaries, 
  getCustomerDetail 
} from './services/googleSheets';

const SUMMARY_SHEET_GID = '1181732765';
const DEFAULT_SPREADSHEET_ID = '1RLhYYa6thMh_60atGO4bmbXI7j21vWesThZv26ytpfc';
const APP_PASSWORD = '123123123'; // Mật khẩu chung cho toàn app

const INITIAL_GIDS = [
  '2005537397', '959399423', '1624411791', '1936773787', '1427779494',
  '1410453576', '197258654', '1934334655', '1595143066', '998019819',
  '1033472446', '1902415477', '892981804', '2006466663', '1903774197',
  '1258748022', '1981091087', '373305596'
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ff7300', '#413ea0', '#f50057', '#00bcd4', '#ffeb3b', '#4caf50'];

const App: React.FC = () => {
  // --- AUTHENTICATION STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('vps_app_auth') === 'true';
  });
  const [loginPassword, setLoginPassword] = useState('');

  const [config, setConfig] = useState<Config>(() => {
    const saved = localStorage.getItem('vps_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge existing local sheets with the hardcoded INITIAL_GIDS
        // This ensures that if we update INITIAL_GIDS in code, users see the new sheets automatically
        const combinedSheets = Array.from(new Set([...INITIAL_GIDS, ...(parsed.customerSheets || [])]));
        return { ...parsed, customerSheets: combinedSheets };
      } catch (e) {
        return { spreadsheetId: DEFAULT_SPREADSHEET_ID, customerSheets: INITIAL_GIDS };
      }
    }
    return { spreadsheetId: DEFAULT_SPREADSHEET_ID, customerSheets: INITIAL_GIDS };
  });

  const [view, setView] = useState<'home' | 'detail' | 'admin'>('home');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [mounted, setMounted] = useState(false);
  
  const [teamSummary, setTeamSummary] = useState<TeamSummary | null>(null);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [adminPassword, setAdminPassword] = useState(''); // For Admin Settings specifically
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginPassword === APP_PASSWORD) {
      setIsAuthenticated(true);
      localStorage.setItem('vps_app_auth', 'true');
      fetchData(); // Start fetching data immediately after login
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

  const fetchData = useCallback(async (showFullLoader = true) => {
    if (showFullLoader) setLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      const summary = await getTeamSummary(config.spreadsheetId, SUMMARY_SHEET_GID);
      setTeamSummary(summary);
      const customerGids = config.customerSheets.filter(gid => gid !== SUMMARY_SHEET_GID);
      const custSummaries = await getCustomerSummaries(config.spreadsheetId, customerGids);
      setCustomers(custSummaries);
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

  // Fetch data only if authenticated
  useEffect(() => { 
    if (isAuthenticated) {
      fetchData(); 
    } else {
      setLoading(false); // Stop loading spinner if waiting for login
    }
  }, [fetchData, isAuthenticated]);

  const getPnlColor = (value: string) => {
    if (!value || value === '0' || value === '0.0' || value === '0%' || value === '-') return 'text-slate-500';
    return value.trim().startsWith('-') ? 'text-red-500' : 'text-green-500'; 
  };

  const cleanNumber = (val: string | undefined): number => {
    if (!val || val === '-' || val === '' || val === '0' || val === null) return 0;
    let str = String(val).trim();
    str = str.replace(/[\s\u00A0\u200B-\u200D\uFEFF]/g, '');
    if (str === '0' || str === '0.0' || str === '0,0') return 0;
    str = str.replace(/[^\d.,-]/g, '');
    if (!str) return 0;
    if (str.includes(',') && str.includes('.')) {
      if (str.lastIndexOf(',') > str.lastIndexOf('.')) str = str.replace(/\./g, '').replace(',', '.');
      else str = str.replace(/,/g, '');
    } else if (str.includes(',')) {
      const parts = str.split(',');
      if (parts[parts.length - 1].length === 3 && parts.length > 1) str = str.replace(/,/g, '');
      else str = str.replace(',', '.');
    } else if (str.includes('.')) {
      const parts = str.split('.');
      if (parts[parts.length - 1].length === 3 && parts.length > 1) str = str.replace(/\./g, '');
    }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  const totalIntradayPnl = useMemo(() => {
    const sum = customers.reduce((acc, curr) => {
      return acc + cleanNumber(curr.intradayPnl);
    }, 0);
    return sum.toLocaleString('vi-VN');
  }, [customers]);

  const teamDistribution = useMemo(() => {
    return customers
      .map(c => ({ name: c.name, value: parseFloat(c.totalCapital.replace(/[^0-9.-]/g, '')) || 0 }))
      .filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  }, [customers]);

  const verifyAdmin = () => {
    if (adminPassword === APP_PASSWORD) setIsAdminAuthenticated(true);
    else alert('Mật khẩu sai!');
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
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      <header className="bg-blue-700 text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 w-full">
          <div className="flex justify-between items-center">
            {view !== 'home' ? (
              <button onClick={() => { setView('home'); setError(null); }} className="p-1 active:scale-90 hover:bg-blue-600 rounded-full transition-colors"><ArrowLeft className="w-6 h-6" /></button>
            ) : (
              <button onClick={() => fetchData(false)} className={`p-1 hover:bg-blue-600 rounded-full transition-colors ${isRefreshing ? 'animate-spin' : ''}`}><RefreshCcw className="w-5 h-5 opacity-70" /></button>
            )}
            <h1 className="text-lg md:text-xl font-bold truncate px-2">
              {view === 'detail' && customerDetail?.name ? customerDetail.name : 'Quản lý khách hàng VPS'}
            </h1>
            <div className="flex items-center gap-1">
              <button onClick={() => setView('admin')} className="p-1 hover:bg-blue-600 rounded-full transition-colors"><Settings className="w-6 h-6 opacity-70" /></button>
              <button onClick={handleLogout} className="p-1 hover:bg-red-500 rounded-full transition-colors ml-1" title="Đăng xuất"><LogOut className="w-5 h-5 opacity-70" /></button>
            </div>
          </div>
          <div className="flex justify-between items-center mt-2 text-[10px] md:text-xs font-bold text-blue-100 max-w-7xl mx-auto">
            <span className="uppercase tracking-tight">BNHN - Nguyễn Thị Thương</span>
            <span className="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-full backdrop-blur-sm"><Clock className="w-3 h-3" /> {lastUpdated.toLocaleTimeString()}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 overflow-y-auto">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg text-xs md:text-sm mb-4 border border-red-100 overflow-x-auto shadow-sm">
             <pre className="whitespace-pre-wrap font-sans">{error}</pre>
          </div>
        )}

        {view === 'home' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Team Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Tổng vốn Team', value: teamSummary?.totalCapital, pnl: false },
                { label: 'Giá trị thị trường', value: teamSummary?.marketValue, pnl: false },
                { label: 'Lãi lỗ hiện tại', value: teamSummary?.pnl, pnl: true },
                { label: 'Lãi lỗ trong ngày', value: totalIntradayPnl, pnl: true },
                { label: '% Lãi lỗ', value: teamSummary?.pnlPercent, pnl: true }
              ].map((c, i) => (
                <div key={i} className={`bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow ${i === 3 || i === 4 ? 'md:col-span-1' : ''}`}>
                  <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase mb-1">{c.label}</p>
                  <p className={`text-sm md:text-xl font-black ${c.pnl ? getPnlColor(c.value || '') : 'text-slate-800'} break-words`}>{c.value || '0'}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Chart */}
              <section className="lg:col-span-1 bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                <h2 className="text-sm md:text-base font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-600" /> Tỷ trọng vốn
                </h2>
                <div className="flex-1 min-h-[250px] md:min-h-[300px]">
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
                        paddingAngle={2}
                      >
                        {teamDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                        itemStyle={{fontSize: '12px', fontWeight: 600}} 
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Customer List */}
              <section className="lg:col-span-2 bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <h2 className="text-sm md:text-base font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" /> Danh sách khách hàng
                </h2>
                <div className="space-y-3">
                  {customers.map((c) => (
                    <div key={c.id} onClick={() => loadCustomerDetail(c.id)} className="flex items-center justify-between p-3 md:p-4 rounded-xl bg-slate-50 border border-slate-100 hover:bg-blue-50 active:scale-[0.99] transition-all cursor-pointer group">
                      <div className="flex items-center gap-3 md:gap-4">
                         <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs md:text-sm shadow-sm group-hover:bg-blue-200 transition-colors">
                           {c.name.charAt(0)}
                         </div>
                         <div>
                           <p className="font-bold text-slate-800 text-sm md:text-base">{c.name}</p>
                           <p className="text-[10px] md:text-xs text-slate-500 font-mono mt-0.5">Vốn: {c.totalCapital}</p>
                         </div>
                      </div>
                      <div className={`text-right ${getPnlColor(c.pnlPercent)}`}>
                         <span className="text-sm md:text-base font-bold block">{c.pnlPercent}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {view === 'detail' && customerDetail && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            {customerDetail.trading.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="bg-orange-50 px-4 py-3 border-b border-orange-100 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-orange-600" />
                  <h3 className="font-bold text-orange-800 text-sm md:text-base">Giao dịch trong ngày (T0)</h3>
                </div>
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-xs md:text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-100">
                        <th className="text-left pb-2 font-medium">Mã</th>
                        <th className="text-right pb-2 font-medium">Mua T0</th>
                        <th className="text-right pb-2 font-medium">Bán T0</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700">
                      {customerDetail.trading.map((t, idx) => (
                        <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                          <td className="py-2 font-bold">{t.ticker}</td>
                          <td className="py-2 text-right font-mono text-green-600">{t.buy0}</td>
                          <td className="py-2 text-right font-mono text-red-500">{t.sell0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
               <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold mb-1">Tổng Vốn ĐT</p>
                  <p className="text-sm md:text-lg font-black text-slate-800 break-words">{customerDetail.totalCapital}</p>
               </div>
               <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold mb-1">Thị Giá Hiện Tại</p>
                  <p className="text-sm md:text-lg font-black text-blue-600 break-words">{customerDetail.marketValue}</p>
               </div>
               
               <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold mb-1">Lãi/Lỗ Trong Ngày</p>
                  <p className={`text-lg md:text-xl font-black ${getPnlColor(customerDetail.intradayPnl)} break-words`}>
                    {customerDetail.intradayPnl}
                  </p>
               </div>
               <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold mb-1">Lãi/Lỗ Danh mục</p>
                  <p className={`text-lg md:text-xl font-black ${getPnlColor(customerDetail.portfolioPnl)} break-words`}>
                    {customerDetail.portfolioPnl}
                  </p>
               </div>

               <div className="col-span-2 md:col-span-1 bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-center">
                  <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold mb-1">% Tăng trưởng</p>
                  <p className={`text-lg md:text-xl font-black ${getPnlColor(customerDetail.portfolioPercent)}`}>
                    {customerDetail.portfolioPercent}
                  </p>
               </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-blue-600" />
                  <h3 className="font-bold text-blue-800 text-sm md:text-base">Danh mục đầu tư</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs md:text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="text-left p-3 font-semibold whitespace-nowrap">Mã</th>
                        <th className="text-right p-3 font-semibold whitespace-nowrap">KL</th>
                        <th className="text-right p-3 font-semibold whitespace-nowrap">Giá Mua</th>
                        <th className="text-right p-3 font-semibold whitespace-nowrap">Giá TT</th>
                        <th className="text-right p-3 font-semibold whitespace-nowrap">Lãi/Lỗ</th>
                        <th className="text-right p-3 font-semibold whitespace-nowrap">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {customerDetail.portfolio.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-bold text-blue-600">{item.ticker}</td>
                          <td className="p-3 text-right font-mono">{item.total}</td>
                          <td className="p-3 text-right font-mono">{item.avgPrice}</td>
                          <td className="p-3 text-right font-mono">{item.marketPrice}</td>
                          <td className={`p-3 text-right font-mono font-bold ${getPnlColor(item.pnl)}`}>{item.pnl}</td>
                          <td className={`p-3 text-right font-mono font-bold ${getPnlColor(item.percent)}`}>{item.percent}</td>
                        </tr>
                      ))}
                      {customerDetail.portfolio.length === 0 && (
                        <tr><td colSpan={6} className="p-4 text-center text-slate-400 italic">Chưa có cổ phiếu nào</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {customerDetail.weights.length > 0 && (
                <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6 flex flex-col">
                   <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                     <PieChartIcon className="w-4 h-4" /> Phân bổ danh mục
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
                        >
                          {customerDetail.weights.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => value.toLocaleString('vi-VN')} />
                      </PieChart>
                     </ResponsiveContainer>
                   </div>
                   <div className="grid grid-cols-3 gap-2 mt-4">
                      {customerDetail.weights.map((w, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor: COLORS[i % COLORS.length]}} />
                          <span className="text-[10px] md:text-xs font-bold text-slate-600 truncate">{w.ticker} ({w.percent.toFixed(1)}%)</span>
                        </div>
                      ))}
                   </div>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'admin' && (
          <div className="animate-in fade-in zoom-in duration-300 max-w-md mx-auto">
             {!isAdminAuthenticated ? (
               <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 text-center space-y-4">
                 <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-blue-600"><Lock className="w-6 h-6" /></div>
                 <h2 className="text-lg font-bold text-slate-800">Xác thực Admin</h2>
                 <input 
                   type="password" 
                   value={adminPassword}
                   onChange={e => setAdminPassword(e.target.value)}
                   className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-center"
                   placeholder="Nhập mật khẩu..."
                 />
                 <button onClick={verifyAdmin} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold active:scale-95 transition-transform">Đăng nhập</button>
               </div>
             ) : (
               <div className="space-y-6">
                 <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-700 mb-2">Cấu hình ID Google Sheet</h3>
                    <input 
                      className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-slate-50 mb-2 font-mono"
                      value={config.spreadsheetId}
                      onChange={(e) => setConfig({...config, spreadsheetId: e.target.value})}
                    />
                    <div className="flex justify-between items-center mt-4">
                       <h3 className="text-sm font-bold text-slate-700">Danh sách GID Khách hàng</h3>
                       <button 
                         onClick={() => {
                           const newGid = prompt("Nhập GID sheet mới:");
                           if(newGid) setConfig({...config, customerSheets: [...config.customerSheets, newGid]});
                         }}
                         className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-200"
                       >
                         <Plus className="w-3 h-3" /> Thêm
                       </button>
                    </div>
                    <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                      {config.customerSheets.map((gid, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                          <span className="text-xs font-mono text-slate-600 truncate flex-1 mr-2">{gid} {gid === SUMMARY_SHEET_GID ? '(Master)' : ''}</span>
                          {gid !== SUMMARY_SHEET_GID && (
                            <button onClick={() => setConfig({...config, customerSheets: config.customerSheets.filter(g => g !== gid)})} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      ))}
                    </div>
                 </div>
                 <button 
                   onClick={() => {
                     localStorage.setItem('vps_config', JSON.stringify(config));
                     alert('Đã lưu cấu hình!');
                     setView('home');
                     fetchData();
                   }}
                   className="w-full bg-green-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-green-200 active:scale-95 transition-transform"
                 >
                   Lưu & Áp dụng
                 </button>
               </div>
             )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
