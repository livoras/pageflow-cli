import { query, queryOne, execute } from "./db";
import { settingsStore } from "./settings";

interface WebhookData {
  timestamp: string;
  data: any;
  interval?: number;
  changes?: {
    likes?: number;
    collects?: number;
    comments?: number;
  };
}

class DataStore {
  async setData(data: any): Promise<void> {
    const url = data.extractedFrom || "unknown";
    const type = "xiaohongshu";

    // 获取首次快照数据用于计算 changes（相对于基准线的增量）
    const firstSnapshot = await this.getFirstSnapshot(url);

    let changes: { likes?: number; collects?: number; comments?: number } | undefined;

    if (firstSnapshot) {
      const firstData = firstSnapshot.data;
      const firstStats = firstData?.data?.stats;
      const newStats = data?.data?.stats;

      if (firstStats && newStats) {
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

        const firstLikes = extractNum(firstStats.likes);
        const newLikes = extractNum(newStats.likes);
        const firstCollects = extractNum(firstStats.collects);
        const newCollects = extractNum(newStats.collects);
        const firstComments = extractNum(firstStats.total_comments);
        const newComments = extractNum(newStats.total_comments);

        const likesAbbrev = isAbbreviated(newStats.likes);
        const collectsAbbrev = isAbbreviated(newStats.collects);
        const commentsAbbrev = isAbbreviated(newStats.total_comments);

        changes = {
          likes: likesAbbrev ? undefined : newLikes - firstLikes,
          collects: collectsAbbrev ? undefined : newCollects - firstCollects,
          comments: commentsAbbrev ? undefined : newComments - firstComments,
        };
      }
    }

    const settings = await settingsStore.getSettings();

    // 构造完整的数据结构
    const fullData = {
      timestamp: new Date().toISOString(),
      data,
      interval: settings.interval,
      changes,
    };

    // 始终插入新记录（保留历史）
    await execute(
      `INSERT INTO snapshots (url, type, data, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())`,
      [url, type, JSON.stringify(fullData)]
    );
  }

  async getData(): Promise<WebhookData[]> {
    // 获取每个 URL 的最新一条记录
    const rows = await query<{ data: any }>(
      `SELECT s1.data
       FROM snapshots s1
       INNER JOIN (
         SELECT url, MAX(id) as max_id
         FROM snapshots
         GROUP BY url
       ) s2 ON s1.url = s2.url AND s1.id = s2.max_id
       ORDER BY s1.created_at DESC`
    );

    // mysql2 的 JSON 字段自动解析为对象，不需要 JSON.parse
    return rows.map(row => row.data);
  }

  async deleteData(url: string): Promise<void> {
    await execute("DELETE FROM snapshots WHERE url = ?", [url]);
  }

  async getHistory(url: string, limit: number = 100): Promise<WebhookData[]> {
    const rows = await query<{ data: any }>(
      `SELECT data FROM snapshots
       WHERE url = ?
       ORDER BY created_at DESC
       LIMIT ${limit}`,
      [url]
    );

    return rows.map(row => row.data);
  }

  async getFirstSnapshot(url: string): Promise<WebhookData | null> {
    const row = await queryOne<{ data: any }>(
      `SELECT data FROM snapshots
       WHERE url = ?
       ORDER BY created_at ASC
       LIMIT 1`,
      [url]
    );

    return row ? row.data : null;
  }
}

class NotificationStore {
  async isNotified(url: string): Promise<boolean> {
    const row = await queryOne<{ notified_at: Date | null }>(
      "SELECT notified_at FROM snapshots WHERE url = ?",
      [url]
    );
    return row?.notified_at != null;
  }

  async markAsNotified(url: string): Promise<void> {
    await execute(
      "UPDATE snapshots SET notified_at = NOW() WHERE url = ?",
      [url]
    );
  }
}

export const dataStore = new DataStore();
export const notificationStore = new NotificationStore();
