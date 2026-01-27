
export interface TeamSummary {
  totalCapital: string;
  marketValue: string;
  pnl: string;
  pnlPercent: string;
}

export interface CustomerSummary {
  id: string; // Sheet Name
  name: string;
  totalCapital: string;
  pnlPercent: string;
  intradayPnl: string; // From B6
}

export interface TradingActivity {
  ticker: string;
  buy0: string;
  sell0: string;
}

export interface PortfolioItem {
  ticker: string;
  total: string;
  avgPrice: string;
  marketPrice: string;
  pnl: string;
  percent: string;
}

export interface StockWeight {
  ticker: string;
  value: number;
  percent: number;
}

export interface CustomerDetail {
  trading: TradingActivity[];
  intradayPnl: string;
  totalCapital: string; // From B2
  marketValue: string;  // From B3
  portfolioPnl: string;
  portfolioPercent: string;
  portfolio: PortfolioItem[];
  weights: StockWeight[];
}

export interface Config {
  spreadsheetId: string;
  customerSheets: string[];
}
