export const MARKET_ANALYSIS_LIBRARY_PATH = "/data/market-analysis-library.json";

export type ResearchDocument = {
  id: string;
  title: string;
  date: string;
  tags: string[];
  sourceFiles: string[];
  preview: string;
  toc: string[];
  content: string;
  lineCount: number;
};

export type MarketAnalysisLibrary = {
  generatedAt: string;
  macroReports: ResearchDocument[];
  usEconomicDocs: ResearchDocument[];
};
