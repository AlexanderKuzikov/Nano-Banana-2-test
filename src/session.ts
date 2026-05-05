export interface RequestRecord {
  inputFile?: string;
  outputFile?: string;
  durationMs: number;
  responseSource: 'b64_json' | 'url' | 'none' | 'error';
  usage?: Record<string, unknown> | null;
  error?: string;
}

export interface SessionReport {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  mode: string;
  model: string;
  baseURL: string;
  totalRequests: number;
  succeeded: number;
  failed: number;
  requests: RequestRecord[];
  totalUsage: Record<string, number>;
}

export class Session {
  private startedAt: Date;
  private records: RequestRecord[] = [];

  constructor() {
    this.startedAt = new Date();
  }

  add(record: RequestRecord): void {
    this.records.push(record);
  }

  build(mode: string, model: string, baseURL: string): SessionReport {
    const finishedAt = new Date();
    const succeeded = this.records.filter(r => r.responseSource !== 'error' && r.responseSource !== 'none').length;
    const failed = this.records.length - succeeded;

    // Sum numeric usage fields across all requests
    const totalUsage: Record<string, number> = {};
    for (const r of this.records) {
      if (r.usage && typeof r.usage === 'object') {
        for (const [k, v] of Object.entries(r.usage)) {
          if (typeof v === 'number') {
            totalUsage[k] = (totalUsage[k] ?? 0) + v;
          }
        }
      }
    }

    return {
      startedAt: this.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - this.startedAt.getTime(),
      mode,
      model,
      baseURL,
      totalRequests: this.records.length,
      succeeded,
      failed,
      requests: this.records,
      totalUsage,
    };
  }
}
