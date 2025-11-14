interface WebhookData {
  timestamp: string;
  data: any;
}

class DataStore {
  private cache: Map<string, WebhookData> = new Map();

  setData(data: any): void {
    const url = data.extractedFrom || "unknown";
    this.cache.set(url, {
      timestamp: new Date().toISOString(),
      data,
    });
  }

  getData(): WebhookData[] {
    return Array.from(this.cache.values()).sort(
      (a, b) => b.timestamp.localeCompare(a.timestamp)
    );
  }
}

export const dataStore = new DataStore();
