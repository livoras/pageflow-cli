import fs from "fs";
import path from "path";

export interface Settings {
  interval: number;
  wechatWebhookUrls: string[];
  likesThreshold: number;
  commentsThreshold: number;
  maxJobs: number;
}

const DEFAULT_SETTINGS: Settings = {
  interval: 10,
  wechatWebhookUrls: ["https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=d18c52a5-f561-4ec6-8482-fdc8b94f36ec"],
  likesThreshold: 20,
  commentsThreshold: 10,
  maxJobs: 10,
};

class SettingsStore {
  private settingsFile: string;

  constructor() {
    this.settingsFile = path.join(process.cwd(), "data", "settings.json");
  }

  private ensureSettingsFile(): void {
    const dir = path.dirname(this.settingsFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.settingsFile)) {
      fs.writeFileSync(
        this.settingsFile,
        JSON.stringify(DEFAULT_SETTINGS, null, 2),
        "utf-8"
      );
    }
  }

  getSettings(): Settings {
    this.ensureSettingsFile();
    const content = fs.readFileSync(this.settingsFile, "utf-8");
    const settings = JSON.parse(content);

    if ('wechatWebhookUrl' in settings && typeof settings.wechatWebhookUrl === 'string') {
      settings.wechatWebhookUrls = [settings.wechatWebhookUrl];
      delete settings.wechatWebhookUrl;
      fs.writeFileSync(
        this.settingsFile,
        JSON.stringify(settings, null, 2),
        "utf-8"
      );
    }

    return settings;
  }

  updateSettings(updates: Partial<Settings>): Settings {
    const current = this.getSettings();
    const updated = { ...current, ...updates };
    fs.writeFileSync(
      this.settingsFile,
      JSON.stringify(updated, null, 2),
      "utf-8"
    );
    return updated;
  }
}

export const settingsStore = new SettingsStore();
