import { Request, Response, Application } from "express";
import { BaseRouteHandler } from "./BaseRouteHandler";
import { JobManager } from "../jobs/JobManager";
import { StateManager } from "../services/StateManager";
import { RequestValidator } from "../utils/RequestValidator";

export class JobRoutes extends BaseRouteHandler {
  private jobManager: JobManager;

  constructor(
    stateManager: StateManager,
    jobManager: JobManager,
  ) {
    super(stateManager);
    this.jobManager = jobManager;
  }

  registerRoutes(app: Application): void {
    app.post("/api/jobs", async (req: Request, res: Response) => {
      const type = RequestValidator.requireString(req.body.type, "Job type");
      const name = RequestValidator.requireString(req.body.name, "Job name");
      const config = req.body.config;
      const interval = parseInt(req.body.interval, 10);

      if (!config || typeof config !== "object") {
        return res.status(400).json({ error: "Job config is required and must be an object" });
      }

      if (isNaN(interval) || interval <= 0) {
        return res.status(400).json({ error: "Job interval must be a positive number" });
      }

      const job = await this.jobManager.createJob(type, name, config, interval);

      res.json({
        id: job.id,
        type: job.type,
        name: job.name,
        config: job.config,
        interval: job.interval,
        enabled: job.enabled,
        createdAt: job.createdAt,
        lastRunAt: job.lastRunAt,
        runCount: job.runCount,
        webhookSuccessCount: job.webhookSuccessCount,
        webhookFailureCount: job.webhookFailureCount,
      });
    });

    app.get("/api/jobs", async (req: Request, res: Response) => {
      const jobs = this.jobManager.getAllJobs();
      const type = req.query.type as string | undefined;

      const filteredJobs = type
        ? jobs.filter((j) => j.type === type)
        : jobs;

      res.json({
        jobs: filteredJobs.map((job) => ({
          id: job.id,
          type: job.type,
          name: job.name,
          config: job.config,
          interval: job.interval,
          enabled: job.enabled,
          createdAt: job.createdAt,
          lastRunAt: job.lastRunAt,
          runCount: job.runCount,
          webhookSuccessCount: job.webhookSuccessCount,
          webhookFailureCount: job.webhookFailureCount,
        })),
      });
    });

    app.get("/api/jobs/:id", async (req: Request, res: Response) => {
      const id = req.params.id;
      const job = this.jobManager.getJob(id);

      if (!job) {
        return res.status(404).json({ error: `Job ${id} not found` });
      }

      res.json({
        id: job.id,
        type: job.type,
        name: job.name,
        config: job.config,
        interval: job.interval,
        enabled: job.enabled,
        createdAt: job.createdAt,
        lastRunAt: job.lastRunAt,
        runCount: job.runCount,
        webhookSuccessCount: job.webhookSuccessCount,
        webhookFailureCount: job.webhookFailureCount,
      });
    });

    app.post("/api/jobs/:id/start", async (req: Request, res: Response) => {
      const id = req.params.id;
      const job = this.jobManager.getJob(id);

      if (!job) {
        return res.status(404).json({ error: `Job ${id} not found` });
      }

      await job.start();

      res.json({
        id: job.id,
        type: job.type,
        name: job.name,
        enabled: job.enabled,
        message: "Job started successfully",
      });
    });

    app.post("/api/jobs/:id/stop", async (req: Request, res: Response) => {
      const id = req.params.id;
      const job = this.jobManager.getJob(id);

      if (!job) {
        return res.status(404).json({ error: `Job ${id} not found` });
      }

      await job.stop();

      res.json({
        id: job.id,
        type: job.type,
        name: job.name,
        enabled: job.enabled,
        message: "Job stopped successfully",
      });
    });

    app.delete("/api/jobs/:id", async (req: Request, res: Response) => {
      const id = req.params.id;

      await this.jobManager.deleteJob(id);

      res.json({
        id,
        message: "Job deleted successfully",
      });
    });

    app.patch("/api/jobs/:id/config", async (req: Request, res: Response) => {
      const id = req.params.id;
      const job = this.jobManager.getJob(id);

      if (!job) {
        return res.status(404).json({ error: `Job ${id} not found` });
      }

      const key = RequestValidator.requireString(req.body.key, "Config key");
      const value = req.body.value;

      if (value === undefined) {
        return res.status(400).json({ error: "Config value is required" });
      }

      await job.updateConfig(key, value);

      res.json({
        id: job.id,
        type: job.type,
        name: job.name,
        config: job.config,
        enabled: job.enabled,
        message: "Job config updated successfully",
      });
    });

    app.patch("/api/jobs/:id/interval", async (req: Request, res: Response) => {
      const id = req.params.id;
      const job = this.jobManager.getJob(id);

      if (!job) {
        return res.status(404).json({ error: `Job ${id} not found` });
      }

      const interval = parseInt(req.body.interval, 10);

      if (isNaN(interval) || interval <= 0) {
        return res.status(400).json({ error: "Interval must be a positive number" });
      }

      await job.updateInterval(interval);

      res.json({
        id: job.id,
        type: job.type,
        name: job.name,
        interval: job.interval,
        enabled: job.enabled,
        message: "Job interval updated successfully",
      });
    });
  }
}
