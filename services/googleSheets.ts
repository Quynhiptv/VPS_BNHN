
import { 
  TeamSummary, 
  CustomerSummary, 
  CustomerDetail, 
  TradingActivity, 
  PortfolioItem, 
  StockWeight,
  MarketItem
} from '../types';

// Robust CSV parser
const parseCSV = (text: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; 
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
};

const fetchSheetData = async (spreadsheetId: string, sheetIdOrName: string): Promise<string[][]> => {
  // SAFETY CHECK: Chặn ngay lập tức nếu cố gắng fetch sheet cấm (1181732765)
  if (sheetIdOrName === '1181732765') {
    console.warn('Đã chặn truy cập vào sheet tổng hợp GID 1181732765');
    return [];
  }

  const isGid = /^\d+$/.test(sheetIdOrName);
  const param = isGid ? `gid=${sheetIdOrName}` : `sheet=${encodeURIComponent(sheetIdOrName)}`;
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&headers=0&${param}`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Không thể tải dữ liệu (GID: ${sheetIdOrName}). Kiểm tra quyền truy cập.`);
  const text = await response.text();
  
  return parseCSV(text);
};

// Helper for internal calculations (filtering) - Exported for use in App.tsx
export const cleanNumber = (val: string | undefined): number => {
  if (!val) return 0;
  let str = String(val).trim();

  // Handle Sheet Errors and Empty
  if (str.startsWith('#') || str === '-' || str === '' || str === 'null') return 0;
  
  // Remove invisible characters
  str = str.replace(/[\s\u00A0\u200B-\u200D\uFEFF]/g, '');
  
  // Handle 0 cases strictly
  if (str === '0' || str === '0.0' || str === '0,0') return 0;

  // Remove currency symbols or non-numeric except . , -
  str = str.replace(/[^\d.,-]/g, '');
  if (!str) return 0;

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    // If comma is after dot (1.000,00) -> VN format: remove dots, replace comma with dot
    if (lastComma > lastDot) {
      return parseFloat(str.replace(/\./g, '').replace(',', '.'));
    } 
    // If dot is after comma (1,000.00) -> US format: remove commas
    else {
      return parseFloat(str.replace(/,/g, ''));
    }
  }
  
  if (hasComma) {
    const parts = str.split(',');
    // If multiple commas (1,000,000) -> remove all commas
    if (parts.length > 2) {
      return parseFloat(str.replace(/,/g, ''));
    }
    // If one comma
    if (parts.length === 2) {
       // If 3 digits after comma (1,000) -> Likely thousand separator -> remove comma
       if (parts[1].length === 3) {
         return parseFloat(str.replace(/,/g, ''));
       } 
       // Otherwise (10,5 or 10,50) -> Decimal separator -> replace with dot
       else {
         return parseFloat(str.replace(',', '.'));
       }
    }
  }
  
  if (hasDot) {
    const parts = str.split('.');
    // If multiple dots (1.000.000) -> remove all dots
    if (parts.length > 2) {
      return parseFloat(str.replace(/\./g, ''));
    }
    // If one dot
    if (parts.length === 2) {
       // If 3 digits after dot (1.000) -> Likely thousand separator -> remove dot
       if (parts[1].length === 3) {
         return parseFloat(str.replace(/\./g, ''));
       }
       // Otherwise (10.5) -> Decimal separator -> keep dot
       else {
         return parseFloat(str);
       }
    }
  }

  // Pure integer
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
};

// No longer fetch from Summary Sheet, calculation is done in App.tsx based on customer data
export const getTeamSummary = async (spreadsheetId: string, sheetName: string): Promise<TeamSummary> => {
   return { totalCapital: '0', marketValue: '0', pnl: '0', pnlPercent: '0' };
};

export const getCustomerSummaries = async (spreadsheetId: string, sheetNames: string[]): Promise<CustomerSummary[]> => {
  // Lọc bỏ GID 1181732765 để đảm bảo an toàn
  const validSheetNames = sheetNames.filter(name => name !== '1181732765');
  
  const summaries = await Promise.all(validSheetNames.map(async (name) => {
    try {
      const data = await fetchSheetData(spreadsheetId, name);
      // Row 1 (Index 0): Name (A1)
      // Row 2 (Index 1): Total Capital (B2)
      // Row 3 (Index 2): Market Value (B3)
      // Row 4 (Index 3): Current PnL (B4)
      // Row 5 (Index 4): PnL Percent (B5)
      // Row 6 (Index 5): Intraday PnL (B6)
      
      const customerName = (data[0]?.[0] || '').trim() || `Khách hàng ${name}`;
      const totalCapital = data[1]?.[1] || '0';
      const marketValue = data[2]?.[1] || '0';
      const currentPnl = data[3]?.[1] || '0'; // B4
      const pnlRaw = data[4]?.[1] || '0'; // B5
      const intradayPnl = data[5]?.[1] || '0'; // B6

      return {
        id: name,
        name: customerName,
        totalCapital: totalCapital,
        marketValue: marketValue,
        currentPnl: currentPnl,
        pnlPercent: pnlRaw.includes('%') ? pnlRaw : pnlRaw + '%',
        intradayPnl: intradayPnl
      };
    } catch (e) {
      return null;
    }
  }));
  return summaries.filter(s => s !== null) as CustomerSummary[];
};

export const getCustomerDetail = async (spreadsheetId: string, sheetName: string): Promise<CustomerDetail> => {
  const data = await fetchSheetData(spreadsheetId, sheetName);

  // A1 -> Name
  const name = (data[0]?.[0] || '').trim() || `Khách hàng ${sheetName}`;

  // B2 (Row index 1, Col index 1) -> Total Capital
  const totalCapital = data[1]?.[1] || '0';
  
  // B3 (Row index 2, Col index 1) -> Market Value
  const marketValue = data[2]?.[1] || '0';
  
  // B4 (Row index 3, Col index 1) -> Portfolio PnL (Lãi lỗ hiện tại danh mục)
  const portfolioPnl = data[3]?.[1] || '0';

  // B5 (Row index 4, Col index 1) -> Growth % 
  const portfolioPercent = data[4]?.[1] || '0'; 

  // B6 (Row index 5, Col index 1) -> Intraday PnL
  const intradayPnl = data[5]?.[1] || '0';

  // S=18, T=19, U=20, V=21, W=22, X=23, Y=24, Z=25
  const COL = {
    TICKER: 18,    // S
    TOTAL: 19,     // T
    BUY_T0: 20,    // U
    SELL_T0: 21,   // V
    AVG_PRICE: 22, // W
    MKT_PRICE: 23, // X
    PNL_VAL: 24,   // Y
    PNL_PCT: 25    // Z
  };

  const trading: TradingActivity[] = [];
  const portfolio: PortfolioItem[] = [];
  const rawWeights: { ticker: string; value: number }[] = [];
  
  let totalValueForWeights = 0;

  // UPDATED RANGE: Rows 2 to 12 (Indices 1 to 11)
  const START_IDX = 1; 
  const END_IDX = 12;

  for (let i = START_IDX; i < END_IDX; i++) {
    if (i >= data.length) break;
    const row = data[i];
    if (!row) continue;

    const ticker = (row[COL.TICKER] || '').trim();
    if (!ticker || ticker.length < 3 || ticker.startsWith('#')) continue;

    const totalRaw = row[COL.TOTAL] || '0';
    const buyT0Raw = row[COL.BUY_T0] || '0';
    const sellT0Raw = row[COL.SELL_T0] || '0';
    const avgPriceRaw = row[COL.AVG_PRICE] || '0';
    const mktPriceRaw = row[COL.MKT_PRICE] || '0';
    const pnlValRaw = row[COL.PNL_VAL] || '0';
    const pnlPctRaw = row[COL.PNL_PCT] || '0%';

    const totalVal = cleanNumber(totalRaw);
    const buyT0Val = cleanNumber(buyT0Raw);
    const sellT0Val = cleanNumber(sellT0Raw);
    const mktPriceVal = cleanNumber(mktPriceRaw);

    if (buyT0Val > 0 || sellT0Val > 0) {
      trading.push({
        ticker: ticker,
        buy0: buyT0Val > 0 ? buyT0Raw : '',
        sell0: sellT0Val > 0 ? sellT0Raw : ''
      });
    }

    if (totalVal > 0) {
      const percentDisplay = pnlPctRaw.includes('%') ? pnlPctRaw : pnlPctRaw + '%';
      portfolio.push({
        ticker: ticker,
        total: totalRaw,
        avgPrice: avgPriceRaw,
        marketPrice: mktPriceRaw,
        pnl: pnlValRaw, 
        percent: percentDisplay
      });
      const stockValue = totalVal * mktPriceVal; 
      if (stockValue > 0) {
        totalValueForWeights += stockValue;
        rawWeights.push({ ticker, value: stockValue });
      }
    }
  }

  const weights: StockWeight[] = rawWeights.map(item => ({
    ticker: item.ticker,
    value: item.value,
    percent: totalValueForWeights > 0 ? (item.value / totalValueForWeights) * 100 : 0
  }));

  return {
    name,
    trading,
    intradayPnl,
    totalCapital,
    marketValue,
    portfolioPnl: portfolioPnl, 
    portfolioPercent,
    portfolio,
    weights
  };
};

export const getMarketBoardData = async (spreadsheetId: string, sheetIds: string[]): Promise<MarketItem[]> => {
  // QUAN TRỌNG: Chặn tuyệt đối GID 1181732765 không cho vào danh sách quét mã
  const validSheetIds = sheetIds.filter(id => id !== '1181732765');
  const uniqueTickers = new Set<string>();

  // 1. Quét dữ liệu từ Sheet để lấy danh sách mã (Cột S, dòng 2-12)
  // Chỉ quét từ các sheet hợp lệ, đã loại bỏ sheet tổng hợp
  const results = await Promise.allSettled(
    validSheetIds.map(id => fetchSheetData(spreadsheetId, id))
  );

  const START_IDX = 1; // Row 2
  const END_IDX = 12;  // Row 12 (Index 11) -> 13 exclusive

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const data = result.value;
      for (let i = START_IDX; i < END_IDX; i++) {
        if (i >= data.length) break;
        const row = data[i];
        if (!row) continue;

        const ticker = (row[18] || '').trim().toUpperCase(); // Column S (Index 18)
        if (ticker && ticker.length >= 3 && !ticker.startsWith('#')) {
          uniqueTickers.add(ticker);
        }
      }
    }
  }

  const tickerArray = Array.from(uniqueTickers).sort();
  if (tickerArray.length === 0) return [];

  // 2. Lấy dữ liệu Realtime từ DNSE (Entrade) API
  // Nguồn này hỗ trợ lấy nhiều mã cùng lúc và CORS khá thoải mái.
  try {
     const symbols = tickerArray.join(',');
     const response = await fetch(`https://services.entrade.com.vn/market-data-service/v1/snapshots/stock?symbols=${symbols}`);
     
     if (!response.ok) {
       throw new Error(`API DNSE trả về lỗi: ${response.status}`);
     }

     const json = await response.json();
     // Cấu trúc DNSE: { list: [ { symbol: 'HPG', lastPrice: 29500, change: -100, high: 29600, low: 29400 }, ... ] }
     
     const dataMap = new Map();
     if (json.list && Array.isArray(json.list)) {
        json.list.forEach((item: any) => {
           if (item && item.symbol) {
             dataMap.set(item.symbol, item);
           }
        });
     }

     return tickerArray.map(ticker => {
        const item = dataMap.get(ticker);
        if (item) {
          return {
            ticker: ticker,
            currentPrice: item.lastPrice || 0,
            change: item.change || 0,
            high: item.high || 0,
            low: item.low || 0
          } as MarketItem;
        }
        return {
           ticker,
           currentPrice: 0,
           change: 0,
           high: 0,
           low: 0
        } as MarketItem;
     });

  } catch (error) {
     console.error("Lỗi lấy dữ liệu thị trường (DNSE):", error);
     // Trả về danh sách rỗng để không crash UI, hiển thị 0
     return tickerArray.map(t => ({
         ticker: t,
         currentPrice: 0,
         change: 0,
         high: 0,
         low: 0
     }));
  }
};
