import { Job } from "./Job";
import { JobStorage } from "./JobStorage";
import { JobRegistry } from "./JobRegistry";
import { StateManager } from "../services/StateManager";
import { PageService } from "../services/PageService";

function generateId(): string {
  return Math.random().toString(36).substring(2, 8);
}

export class JobManager {
  private jobs: Map<string, Job> = new Map();
  private storage: JobStorage;
  private stateManager: StateManager;
  private pageService: PageService;

  constructor(
    instanceName: string,
    stateManager: StateManager,
    pageService: PageService,
  ) {
    this.stateManager = stateManager;
    this.pageService = pageService;
    this.storage = new JobStorage(instanceName, stateManager, pageService);
  }

  async initialize(): Promise<void> {
    this.jobs = await this.storage.loadAll();

    for (const job of this.jobs.values()) {
      if (job.enabled) {
        await job.start();
      }
    }

    console.log(`[JobManager] Loaded ${this.jobs.size} jobs`);
  }

  async createJob(
    type: string,
    name: string,
    config: Record<string, any>,
    interval: number,
  ): Promise<Job> {
    const job = JobRegistry.create(
      type,
      {
        id: generateId(),
        type,
        name,
        config,
        interval,
        enabled: false,
        createdAt: new Date(),
        lastRunAt: null,
        runCount: 0,
      },
      {
        stateManager: this.stateManager,
        pageService: this.pageService,
      },
    );

    job.setStorage(this.storage);
    this.jobs.set(job.id, job);
    await job.save();

    return job;
  }

  getJob(id: string): Job | null {
    return this.jobs.get(id) || null;
  }

  getAllJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  getJobsByType(type: string): Job[] {
    return Array.from(this.jobs.values()).filter((j) => j.type === type);
  }

  async deleteJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`Job ${id} not found`);
    }

    await job.delete();
    this.jobs.delete(id);
  }
}
