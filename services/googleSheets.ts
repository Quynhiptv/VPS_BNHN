
import { 
  TeamSummary, 
  CustomerSummary, 
  CustomerDetail, 
  TradingActivity, 
  PortfolioItem, 
  StockWeight 
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
  const isGid = /^\d+$/.test(sheetIdOrName);
  const param = isGid ? `gid=${sheetIdOrName}` : `sheet=${encodeURIComponent(sheetIdOrName)}`;
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&headers=0&${param}`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Không thể tải dữ liệu (GID: ${sheetIdOrName}). Kiểm tra quyền truy cập.`);
  const text = await response.text();
  
  return parseCSV(text);
};

const colToIndex = (col: string): number => {
  let index = 0;
  const upperCol = col.toUpperCase();
  for (let i = 0; i < upperCol.length; i++) {
    index = index * 26 + (upperCol.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return index - 1;
};

// Helper for internal calculations (filtering)
const cleanNumber = (val: string | undefined): number => {
  if (!val || val === '-' || val === '' || val === '0' || val === null) return 0;
  
  let str = String(val).trim();
  str = str.replace(/[\s\u00A0\u200B-\u200D\uFEFF]/g, ''); // Remove spaces
  
  // Handle 0 cases strictly
  if (str === '0' || str === '0.0' || str === '0,0') return 0;

  str = str.replace(/[^\d.,-]/g, '');

  if (!str) return 0;

  if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
       str = str.replace(/\./g, '').replace(',', '.');
    } else {
       str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    const parts = str.split(',');
    if (parts[parts.length - 1].length === 3 && parts.length > 1) {
       str = str.replace(/,/g, '');
    } else {
       str = str.replace(',', '.');
    }
  } else if (str.includes('.')) {
    const parts = str.split('.');
    if (parts[parts.length - 1].length === 3 && parts.length > 1) {
       str = str.replace(/\./g, '');
    }
  }
  
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
};

export const getTeamSummary = async (spreadsheetId: string, sheetName: string): Promise<TeamSummary> => {
  const data = await fetchSheetData(spreadsheetId, sheetName);
  return {
    totalCapital: data[1]?.[colToIndex('AE')] || '0',
    marketValue: data[1]?.[colToIndex('AF')] || '0',
    pnl: data[1]?.[colToIndex('AD')] || '0',
    pnlPercent: data[3]?.[colToIndex('M')] || '0',
  };
};

export const getCustomerSummaries = async (spreadsheetId: string, sheetNames: string[]): Promise<CustomerSummary[]> => {
  const summaries = await Promise.all(sheetNames.map(async (name) => {
    try {
      const data = await fetchSheetData(spreadsheetId, name);
      // PnL Percent for summary (Row 5 -> Index 4 -> B5)
      const pnlRaw = data[4]?.[1] || '0'; 
      return {
        id: name,
        name: data[0]?.[0] || 'N/A',
        totalCapital: data[1]?.[1] || '0',
        pnlPercent: pnlRaw.includes('%') ? pnlRaw : pnlRaw + '%',
        intradayPnl: data[5]?.[1] || '0' // Get B6
      };
    } catch (e) {
      return null;
    }
  }));
  return summaries.filter(s => s !== null) as CustomerSummary[];
};

export const getCustomerDetail = async (spreadsheetId: string, sheetName: string): Promise<CustomerDetail> => {
  const data = await fetchSheetData(spreadsheetId, sheetName);

  // --- NEW MAPPING REQUIREMENTS ---
  // A1 -> Name
  const name = data[0]?.[0] || '';

  // B2 (Row index 1, Col index 1) -> Total Capital
  const totalCapital = data[1]?.[1] || '0';
  
  // B3 (Row index 2, Col index 1) -> Market Value
  const marketValue = data[2]?.[1] || '0';
  
  // B5 (Row index 4, Col index 1) -> Growth % (Phần trăm tăng trưởng)
  const portfolioPercent = data[4]?.[1] || '0'; 

  // B6 (Row index 5, Col index 1) -> Intraday PnL (Lãi/Lỗ trong ngày)
  const intradayPnl = data[5]?.[1] || '0';

  // MAPPING CONFIGURATION
  // Columns Indices (0-based)
  // S=18, T=19, U=20, V=21, W=22, X=23, Y=24, Z=25
  const COL = {
    TICKER: 18,    // S: Tên Mã
    TOTAL: 19,     // T: Số lượng
    BUY_T0: 20,    // U: Mua T0
    SELL_T0: 21,   // V: Bán T0
    AVG_PRICE: 22, // W: Giá Mua
    MKT_PRICE: 23, // X: Giá Hiện Tại
    PNL_VAL: 24,   // Y: Lãi lỗ
    PNL_PCT: 25    // Z: Phần trăm
  };

  const trading: TradingActivity[] = [];
  const portfolio: PortfolioItem[] = [];
  const rawWeights: { ticker: string; value: number }[] = [];
  
  let totalValueForWeights = 0;
  let totalPnlVal = 0;

  // UPDATED RANGE SCANNING: Rows 2 to 9 (Indices 1 to 8)
  // Per user request: "Dữ liệu lấy từ hàng 2 tới hàng 9. Chỉ trong phạm vi đó thôi"
  const START_IDX = 1; // Row 2
  const END_IDX = 9;   // Row 10 (exclusive, so loop runs for indices 1,2,3,4,5,6,7,8 = Rows 2-9)

  for (let i = START_IDX; i < END_IDX; i++) {
    // Safety check if row exists
    if (i >= data.length) break;

    const row = data[i];
    if (!row) continue;

    const ticker = (row[COL.TICKER] || '').trim();
    // Basic validation: ticker should be 3-4 chars usually
    if (!ticker || ticker.length < 3) continue;

    // 1. Extract Values
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
    const pnlVal = cleanNumber(pnlValRaw);

    // 2. Build Intraday Trading List
    if (buyT0Val > 0 || sellT0Val > 0) {
      trading.push({
        ticker: ticker,
        buy0: buyT0Val > 0 ? buyT0Raw : '',
        sell0: sellT0Val > 0 ? sellT0Raw : ''
      });
    }

    // 3. Build Portfolio List
    // Always add to portfolio if ticker exists in this range, even if quantity is 0,
    // though typically we check totalVal > 0. User didn't specify to change this logic, just the range.
    if (totalVal > 0) {
      const percentDisplay = pnlPctRaw.includes('%') ? pnlPctRaw : pnlPctRaw + '%';
      
      portfolio.push({
        ticker: ticker,
        total: totalRaw,
        avgPrice: avgPriceRaw,
        marketPrice: mktPriceRaw,
        pnl: pnlValRaw, // Mapped to Col Y
        percent: percentDisplay
      });

      // 4. Calculate Weights & Totals
      const stockValue = totalVal * mktPriceVal; 
      if (stockValue > 0) {
        totalValueForWeights += stockValue;
        rawWeights.push({ ticker, value: stockValue });
      }

      totalPnlVal += pnlVal;
    }
  }

  // Calculate weights based on collected data
  const weights: StockWeight[] = rawWeights.map(item => ({
    ticker: item.ticker,
    value: item.value,
    percent: totalValueForWeights > 0 ? (item.value / totalValueForWeights) * 100 : 0
  }));

  // Helper to format currency broadly
  const fmt = (n: number) => n.toLocaleString('vi-VN');

  return {
    name,
    trading,
    intradayPnl, // B6
    totalCapital, // B2
    marketValue,  // B3
    portfolioPnl: fmt(totalPnlVal),
    portfolioPercent, // B5
    portfolio,
    weights
  };
};
