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
    };
  }
}
