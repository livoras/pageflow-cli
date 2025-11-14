interface WebhookData {
  timestamp: string;
  data: any;
}

class DataStore {
  private xiaohongshuCache: Map<string, WebhookData> = new Map();
  private baiduCache: Map<string, WebhookData> = new Map();

  setXiaohongshuData(data: any): void {
    const url = data.extractedFrom || "unknown";
    this.xiaohongshuCache.set(url, {
      timestamp: new Date().toISOString(),
      data,
    });
  }

  getXiaohongshuData(): WebhookData[] {
    return Array.from(this.xiaohongshuCache.values()).sort(
      (a, b) => b.timestamp.localeCompare(a.timestamp)
    );
  }

  setBaiduData(data: any): void {
    const url = data.extractedFrom || "unknown";
    this.baiduCache.set(url, {
      timestamp: new Date().toISOString(),
      data,
    });
  }

  getBaiduData(): WebhookData[] {
    return Array.from(this.baiduCache.values()).sort(
      (a, b) => b.timestamp.localeCompare(a.timestamp)
    );
  }
}

export const dataStore = new DataStore();
