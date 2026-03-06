export type RiskLevel = 'safe' | 'review' | 'needs_approval' | 'destructive';

export type FunctionKind =
  | 'function'
  | 'arrow_function'
  | 'method'
  | 'route_handler';

export interface ToolFinding {
  filePath: string;
  functionName: string;
  line: number;
  exported: boolean;
  kind: FunctionKind;
  risk: RiskLevel;
  reasons: string[];
  signals: string[];
}

export interface ScanSummary {
  scannedFiles: number;
  findings: ToolFinding[];
  counts: Record<RiskLevel, number>;
}
