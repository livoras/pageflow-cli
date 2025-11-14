import { Request, Response, Application } from "express";
import { BaseRouteHandler } from "./BaseRouteHandler";
import { StateManager } from "../services/StateManager";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

export class LogRoutes extends BaseRouteHandler {
  private instanceName: string;
  private logsDir: string;

  constructor(stateManager: StateManager, instanceName: string) {
    super(stateManager);
    this.instanceName = instanceName;
    this.logsDir = path.join(os.homedir(), ".pageflow", instanceName, "logs");
  }

  registerRoutes(app: Application): void {
    app.get("/api/logs", async (req: Request, res: Response) => {
      const lines = parseInt((req.query.lines as string) || "100", 10);
      const all = req.query.all === "true";

      if (isNaN(lines) || lines <= 0) {
        return res.status(400).json({ error: "lines must be a positive number" });
      }

      if (!fs.existsSync(this.logsDir)) {
        return res.status(404).json({
          error: "No logs found",
          logsDir: this.logsDir
        });
      }

      let output: string;

      if (all) {
        const logFiles = fs.readdirSync(this.logsDir)
          .filter(f => f.endsWith('.log') && f !== 'latest.log')
          .sort()
          .map(f => path.join(this.logsDir, f));

        if (logFiles.length === 0) {
          return res.status(404).json({ error: "No log files found" });
        }

        const cmd = `cat ${logFiles.map(f => `"${f}"`).join(' ')} | tail -n ${lines}`;
        output = execSync(cmd, { encoding: 'utf-8' });
      } else {
        const latestLog = path.join(this.logsDir, 'latest.log');
        if (!fs.existsSync(latestLog)) {
          return res.status(404).json({ error: "No latest log file found" });
        }

        output = execSync(`tail -n ${lines} "${latestLog}"`, { encoding: 'utf-8' });
      }

      res.json({
        instanceName: this.instanceName,
        lines: lines,
        all: all,
        content: output
      });
    });
  }
}
