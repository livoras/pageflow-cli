import { query, execute } from "./db";

export interface Settings {
  interval: number;
  wechatWebhookUrls: string[];
  likesThreshold: number;
  commentsThreshold: number;
  maxJobs: number;
  likesIncrement: number;
  commentsIncrement: number;
}

const DEFAULT_SETTINGS: Settings = {
  interval: 10,
  wechatWebhookUrls: ["https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=d18c52a5-f561-4ec6-8482-fdc8b94f36ec"],
  likesThreshold: 20,
  commentsThreshold: 10,
  maxJobs: 10,
  likesIncrement: 10,
  commentsIncrement: 5,
};

class SettingsStore {
  async getSettings(): Promise<Settings> {
    const rows = await query<{ key: string; value: string }>(
      "SELECT `key`, value FROM settings"
    );

    // 如果没有任何设置，初始化默认值
    if (rows.length === 0) {
      await this.initializeSettings();
      return DEFAULT_SETTINGS;
    }

    // 将数据库中的 key-value 转换为 Settings 对象
    const settings: any = { ...DEFAULT_SETTINGS };

    for (const row of rows) {
      const { key, value } = row;

      if (key === 'wechatWebhookUrls') {
        settings[key] = JSON.parse(value);
      } else if (key === 'interval' || key === 'likesThreshold' || key === 'commentsThreshold' || key === 'maxJobs' || key === 'likesIncrement' || key === 'commentsIncrement') {
        settings[key] = parseInt(value);
      } else {
        settings[key] = value;
      }
    }

    return settings as Settings;
  }

  async updateSettings(updates: Partial<Settings>): Promise<Settings> {
    // 更新每个设置项
    for (const [key, value] of Object.entries(updates)) {
      const stringValue = Array.isArray(value) ? JSON.stringify(value) : String(value);

      await execute(
        `INSERT INTO settings (\`key\`, value, updated_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()`,
        [key, stringValue, stringValue]
      );
    }

    return this.getSettings();
  }

  private async initializeSettings(): Promise<void> {
    // 插入默认设置
    const entries: [string, string][] = [
      ['interval', String(DEFAULT_SETTINGS.interval)],
      ['wechatWebhookUrls', JSON.stringify(DEFAULT_SETTINGS.wechatWebhookUrls)],
      ['likesThreshold', String(DEFAULT_SETTINGS.likesThreshold)],
      ['commentsThreshold', String(DEFAULT_SETTINGS.commentsThreshold)],
      ['maxJobs', String(DEFAULT_SETTINGS.maxJobs)],
      ['likesIncrement', String(DEFAULT_SETTINGS.likesIncrement)],
      ['commentsIncrement', String(DEFAULT_SETTINGS.commentsIncrement)],
    ];

    for (const [key, value] of entries) {
      await execute(
        `INSERT INTO settings (\`key\`, value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE value = value`,
        [key, value]
      );
    }
  }
}

export const settingsStore = new SettingsStore();
