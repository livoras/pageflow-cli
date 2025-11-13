import { JobStorage } from "./JobStorage";

export abstract class Job {
  id: string;
  type: string;
  name: string;
  config: Record<string, any>;
  interval: number;
  enabled: boolean;
  createdAt: Date;
  lastRunAt: Date | null;
  runCount: number;
  webhookSuccessCount: number;
  webhookFailureCount: number;

  private timer: NodeJS.Timer | null = null;
  private storage: JobStorage | null = null;

  constructor(data: {
    id: string;
    type: string;
    name: string;
    config: Record<string, any>;
    interval: number;
    enabled: boolean;
    createdAt: Date;
    lastRunAt: Date | null;
    runCount: number;
    webhookSuccessCount?: number;
    webhookFailureCount?: number;
  }) {
    this.id = data.id;
    this.type = data.type;
    this.name = data.name;
    this.config = data.config;
    this.interval = data.interval;
    this.enabled = data.enabled;
    this.createdAt = data.createdAt;
    this.lastRunAt = data.lastRunAt;
    this.runCount = data.runCount;
    this.webhookSuccessCount = data.webhookSuccessCount || 0;
    this.webhookFailureCount = data.webhookFailureCount || 0;
  }

  setStorage(storage: JobStorage): void {
    this.storage = storage;
  }

  abstract execute(): Promise<void>;

  async start(): Promise<void> {
    if (this.timer) return;

    await this.execute();

    this.timer = setInterval(async () => {
      await this.execute();
    }, this.interval * 1000);

    this.enabled = true;
    await this.save();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.enabled = false;
    await this.save();
  }

  async save(): Promise<void> {
    if (!this.storage) {
      throw new Error("Job storage not set");
    }
    await this.storage.save(this);
  }

  async delete(): Promise<void> {
    await this.stop();
    if (!this.storage) {
      throw new Error("Job storage not set");
    }
    await this.storage.delete(this.id);
  }

  async updateConfig(key: string, value: any): Promise<void> {
    const wasRunning = this.enabled;

    if (wasRunning) {
      await this.stop();
    }

    const keys = key.split(".");
    let target: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in target)) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }

    target[keys[keys.length - 1]] = value;

    await this.save();

    if (wasRunning) {
      await this.start();
    }
  }

  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      config: this.config,
      interval: this.interval,
      enabled: this.enabled,
      createdAt: this.createdAt.toISOString(),
      lastRunAt: this.lastRunAt ? this.lastRunAt.toISOString() : null,
      runCount: this.runCount,
      webhookSuccessCount: this.webhookSuccessCount,
      webhookFailureCount: this.webhookFailureCount,
    };
  }
}
