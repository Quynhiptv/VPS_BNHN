
import { 
  TeamSummary, 
  CustomerSummary, 
  CustomerDetail, 
  TradingActivity, 
  PortfolioItem, 
  StockWeight,
  MarketItem,
  AggregatedTradingItem
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

export const getAggregatedTradingData = async (spreadsheetId: string, sheetIds: string[]): Promise<AggregatedTradingItem[]> => {
  const validSheetIds = sheetIds.filter(id => id !== '1181732765');
  const results: AggregatedTradingItem[] = [];

  const responses = await Promise.allSettled(
    validSheetIds.map(id => fetchSheetData(spreadsheetId, id))
  );

  const COL_S_TICKER = 18; // Index 18 (Column S)
  const COL_U_BUY = 20;    // Index 20 (Column U)
  const COL_V_SELL = 21;   // Index 21 (Column V)

  // Scan range similar to Customer Detail
  const START_IDX = 1; 
  const END_IDX = 12;

  for (const res of responses) {
    if (res.status === 'fulfilled') {
      const data = res.value;
      
      // Get Customer Name from A1 (Index [0][0])
      const customerName = (data[0]?.[0] || '').trim() || 'Khách hàng';

      for (let i = START_IDX; i < END_IDX; i++) {
        if (i >= data.length) break;
        const row = data[i];
        if (!row) continue;

        const ticker = (row[COL_S_TICKER] || '').trim().toUpperCase();
        if (!ticker || ticker.length < 3 || ticker.startsWith('#')) continue;

        const buyRaw = row[COL_U_BUY] || '0';
        const sellRaw = row[COL_V_SELL] || '0';

        const buyVal = cleanNumber(buyRaw);
        const sellVal = cleanNumber(sellRaw);

        // Chỉ lấy nếu có Mua HOẶC Bán
        if (buyVal > 0 || sellVal > 0) {
          results.push({
            customerName,
            ticker,
            buyVol: buyVal > 0 ? buyRaw : '',
            sellVol: sellVal > 0 ? sellRaw : ''
          });
        }
      }
    }
  }

  return results;
};

export const getMarketBoardData = async (spreadsheetId: string, sheetIds: string[]): Promise<MarketItem[]> => {
  // BƯỚC 1: Quét danh sách Mã từ các sheet Khách hàng (S2:S12)
  // Chặn tuyệt đối GID 1181732765 không cho vào danh sách quét mã
  const validSheetIds = sheetIds.filter(id => id !== '1181732765');
  const uniqueTickers = new Set<string>();

  const customerResults = await Promise.allSettled(
    validSheetIds.map(id => fetchSheetData(spreadsheetId, id))
  );

  const CUSTOMER_START_IDX = 1; // Row 2 (Index 1)
  const CUSTOMER_END_IDX = 12;  // Row 12 (Index 11) -> 12 exclusive (Loop < 12)

  for (const result of customerResults) {
    if (result.status === 'fulfilled') {
      const data = result.value;
      // Duyệt từ hàng 2 đến hàng 12
      for (let i = CUSTOMER_START_IDX; i < CUSTOMER_END_IDX; i++) {
        if (i >= data.length) break;
        const row = data[i];
        if (!row) continue;

        // Cột S là cột thứ 19 -> Index 18
        const ticker = (row[18] || '').trim().toUpperCase(); 
        if (ticker && ticker.length >= 3 && !ticker.startsWith('#')) {
          uniqueTickers.add(ticker);
        }
      }
    }
  }

  if (uniqueTickers.size === 0) return [];

  // BƯỚC 2: Tải dữ liệu từ Google Sheet Bảng điện
  const MARKET_SSID = '13z2aWAtAdjdxQ83vttmicRk9dXd6WqGiQoedGjHFD5c';
  const MARKET_GID = '1628670680';

  try {
    const marketData = await fetchSheetData(MARKET_SSID, MARKET_GID);
    
    // Row 1 là Header, lấy dữ liệu từ Row 2 trở đi
    const START_IDX = 1;
    const result: MarketItem[] = [];

    for (let i = START_IDX; i < marketData.length; i++) {
      const row = marketData[i];
      if (!row || row.length === 0) continue;

      // Cột A (Index 0): Tên Mã
      const ticker = (row[0] || '').trim().toUpperCase();
      
      // BƯỚC 3: Chỉ lấy dữ liệu nếu mã có trong danh sách khách hàng
      if (uniqueTickers.has(ticker)) {
        // Cột B (Index 1): Giá hiện Tại
        const price = cleanNumber(row[1]);

        // Cột C (Index 2): Tăng giảm
        const change = cleanNumber(row[2]);

        result.push({
          ticker: ticker,
          currentPrice: price,
          change: change,
          high: 0,
          low: 0
        });
      }
    }

    return result;

  } catch (error) {
     console.error("Lỗi lấy dữ liệu bảng điện từ Sheet:", error);
     return [];
  }
};
