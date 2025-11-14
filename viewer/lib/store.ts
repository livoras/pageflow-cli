import fs from "fs";
import path from "path";

interface WebhookData {
  timestamp: string;
  data: any;
  changes?: {
    likes?: number;
    collects?: number;
    comments?: number;
  };
}

class DataStore {
  private dataFile: string;

  constructor() {
    this.dataFile = path.join(process.cwd(), "data", "xiaohongshu.json");
  }

  private loadFromFile(): Map<string, WebhookData> {
    const cache = new Map<string, WebhookData>();
    if (fs.existsSync(this.dataFile)) {
      const content = fs.readFileSync(this.dataFile, "utf-8");
      const dataArray: WebhookData[] = JSON.parse(content);
      dataArray.forEach((item) => {
        const url = item.data.extractedFrom || "unknown";
        cache.set(url, item);
      });
    }
    return cache;
  }

  private saveToFile(cache: Map<string, WebhookData>): void {
    const dataArray = Array.from(cache.values());
    const dir = path.dirname(this.dataFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.dataFile, JSON.stringify(dataArray, null, 2), "utf-8");
  }

  setData(data: any): void {
    const url = data.extractedFrom || "unknown";
    const cache = this.loadFromFile();
    const oldData = cache.get(url);

    let changes: { likes?: number; collects?: number; comments?: number } | undefined;

    if (oldData) {
      const oldStats = oldData.data?.data?.stats;
      const newStats = data?.data?.stats;

      if (oldStats && newStats) {
        const isAbbreviated = (val: any) => {
          if (!val) return false;
          const str = val.toString();
          return /[千万亿kmb\+]/i.test(str);
        };

        const extractNum = (val: any) => {
          if (!val) return 0;
          const str = val.toString().replace(/[^\d]/g, "");
          return parseInt(str) || 0;
        };

        const oldLikes = extractNum(oldStats.likes);
        const newLikes = extractNum(newStats.likes);
        const oldCollects = extractNum(oldStats.collects);
        const newCollects = extractNum(newStats.collects);
        const oldComments = extractNum(oldStats.total_comments);
        const newComments = extractNum(newStats.total_comments);

        const likesAbbrev = isAbbreviated(newStats.likes);
        const collectsAbbrev = isAbbreviated(newStats.collects);
        const commentsAbbrev = isAbbreviated(newStats.total_comments);

        changes = {
          likes: likesAbbrev ? undefined : newLikes - oldLikes,
          collects: collectsAbbrev ? undefined : newCollects - oldCollects,
          comments: commentsAbbrev ? undefined : newComments - oldComments,
        };
      }
    }

    cache.set(url, {
      timestamp: new Date().toISOString(),
      data,
      changes,
    });
    this.saveToFile(cache);
  }

  getData(): WebhookData[] {
    const cache = this.loadFromFile();
    return Array.from(cache.values()).sort(
      (a, b) => b.timestamp.localeCompare(a.timestamp)
    );
  }

  deleteData(url: string): void {
    const cache = this.loadFromFile();
    cache.delete(url);
    this.saveToFile(cache);
  }
}

class NotificationStore {
  private notifiedFile: string;

  constructor() {
    this.notifiedFile = path.join(process.cwd(), "data", "notified.json");
  }

  private loadNotified(): Set<string> {
    if (fs.existsSync(this.notifiedFile)) {
      const content = fs.readFileSync(this.notifiedFile, "utf-8");
      const data = JSON.parse(content);
      return new Set(data.notified || []);
    }
    return new Set();
  }

  private saveNotified(notified: Set<string>): void {
    const dir = path.dirname(this.notifiedFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = { notified: Array.from(notified) };
    fs.writeFileSync(this.notifiedFile, JSON.stringify(data, null, 2), "utf-8");
  }

  isNotified(url: string): boolean {
    const notified = this.loadNotified();
    return notified.has(url);
  }

  markAsNotified(url: string): void {
    const notified = this.loadNotified();
    notified.add(url);
    this.saveNotified(notified);
  }
}

export const dataStore = new DataStore();
export const notificationStore = new NotificationStore();
