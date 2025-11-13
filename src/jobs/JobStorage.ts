import fs from "fs";
import path from "path";
import os from "os";
import { Job } from "./Job";
import { JobRegistry } from "./JobRegistry";
import { StateManager } from "../services/StateManager";
import { PageService } from "../services/PageService";

export class JobStorage {
  private instanceName: string;
  private stateManager: StateManager;
  private pageService: PageService;

  constructor(
    instanceName: string,
    stateManager: StateManager,
    pageService: PageService,
  ) {
    this.instanceName = instanceName;
    this.stateManager = stateManager;
    this.pageService = pageService;
  }

  private get jobsFile(): string {
    return path.join(
      os.homedir(),
      ".pageflow",
      this.instanceName,
      "jobs.json",
    );
  }

  async save(job: Job): Promise<void> {
    const jobs = await this.loadAll();
    jobs.set(job.id, job);

    const dir = path.dirname(this.jobsFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = Array.from(jobs.values()).map((j) => j.toJSON());
    await fs.promises.writeFile(
      this.jobsFile,
      JSON.stringify(data, null, 2),
      "utf-8",
    );
  }

  async delete(id: string): Promise<void> {
    const jobs = await this.loadAll();
    jobs.delete(id);

    const data = Array.from(jobs.values()).map((j) => j.toJSON());
    await fs.promises.writeFile(
      this.jobsFile,
      JSON.stringify(data, null, 2),
      "utf-8",
    );
  }

  async loadAll(): Promise<Map<string, Job>> {
    if (!fs.existsSync(this.jobsFile)) {
      return new Map();
    }

    const content = await fs.promises.readFile(this.jobsFile, "utf-8");
    const data = JSON.parse(content);

    const jobs = new Map<string, Job>();
    for (const item of data) {
      const jobData = {
        ...item,
        createdAt: new Date(item.createdAt),
        lastRunAt: item.lastRunAt ? new Date(item.lastRunAt) : null,
      };

      const job = JobRegistry.create(item.type, jobData, {
        stateManager: this.stateManager,
        pageService: this.pageService,
      });

      job.setStorage(this);
      jobs.set(job.id, job);
    }
    return jobs;
  }
}
