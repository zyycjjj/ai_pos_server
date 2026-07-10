export type AiExecutionStatus = 'success' | 'failed' | 'fallback';

export type AiExecutionTrace = {
  provider: string;
  model: string;
  status: AiExecutionStatus;
  latencyMs?: number;
  tokenUsage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  errorCode?: string;
};

