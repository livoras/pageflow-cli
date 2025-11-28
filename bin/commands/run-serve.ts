import { Command } from "commander";
import express from "express";
import axios from "axios";
import { InstanceManager } from "../../src/utils/InstanceManager";

interface InstanceState {
  name: string;
  endpoint: string;
  healthy: boolean;
  lastCheck: number;
}

export function registerRunServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Start a dispatch server that distributes requests across instances")
    .option("-p, --port <number>", "Server port", "4001")
    .option("-i, --instances <names>", "Comma-separated instance names (default: all)")
    .option("--health-interval <seconds>", "Health check interval in seconds", "30")
    .addHelpText(
      "after",
      `
Description:
  Starts a local HTTP server that dispatches requests
  to multiple pageflow instances with load balancing.

Options:
  -p, --port <number>           Server port (default: 4001)
  -i, --instances <names>       Instance names, comma-separated (default: all)
  --health-interval <seconds>   Health check interval (default: 30)

Endpoints:
  POST /api/run   - Dispatch script execution
  POST /api/a11y  - Dispatch accessibility tree request
  GET  /api/health - Check dispatch server status

Request Format (type: "round" or "random"):
  POST /api/run   { url, script, timeout?, type? }
  POST /api/a11y  { url, selector?, timeout?, type? }

Examples:
  # Start dispatch server on default port with all instances
  $ pageflow run serve

  # Start on specific port with selected instances
  $ pageflow run serve --port 5000 --instances tago,tago2,tencent

  # Custom health check interval
  $ pageflow run serve --health-interval 60

`,
    )
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      const healthInterval = parseInt(options.healthInterval, 10) * 1000;
      const instanceManager = new InstanceManager();

      // Get instance list
      let instanceNames: string[];
      if (options.instances) {
        instanceNames = options.instances.split(",").map((s: string) => s.trim());
      } else {
        instanceNames = instanceManager.getAllInstances().map((inst) => inst.name);
      }

      if (instanceNames.length === 0) {
        console.error("Error: No instances available");
        process.exit(1);
      }

      // Build instance states
      const instances: InstanceState[] = [];
      for (const name of instanceNames) {
        const instance = instanceManager.getInstance(name);
        if (!instance) {
          console.error(`Warning: Instance "${name}" not found, skipping`);
          continue;
        }

        const endpoint =
          instance.type === "remote"
            ? instance.url
            : `http://localhost:${instance.port}`;

        instances.push({
          name,
          endpoint,
          healthy: false,
          lastCheck: 0,
        });
      }

      if (instances.length === 0) {
        console.error("Error: No valid instances found");
        process.exit(1);
      }

      // Health check function
      const checkHealth = async (instance: InstanceState): Promise<boolean> => {
        try {
          const response = await axios.get(`${instance.endpoint}/api/health`, {
            timeout: 5000,
          });
          return response.status === 200;
        } catch {
          return false;
        }
      };

      // Check all instances health
      const checkAllHealth = async () => {
        const results = await Promise.all(
          instances.map(async (inst) => {
            const wasHealthy = inst.healthy;
            inst.healthy = await checkHealth(inst);
            inst.lastCheck = Date.now();

            if (wasHealthy !== inst.healthy) {
              const status = inst.healthy ? "healthy" : "unhealthy";
              console.log(`[Health] ${inst.name} is now ${status}`);
            }
            return inst.healthy;
          })
        );

        const healthyCount = results.filter(Boolean).length;
        return healthyCount;
      };

      // Initial health check
      console.log("Checking instance health...");
      const initialHealthy = await checkAllHealth();
      console.log(`${initialHealthy}/${instances.length} instances healthy`);

      if (initialHealthy === 0) {
        console.error("Warning: No healthy instances available, server will start anyway");
      }

      // Start periodic health check
      const healthTimer = setInterval(async () => {
        await checkAllHealth();
      }, healthInterval);

      // Round-robin index
      let roundRobinIndex = 0;

      // Get healthy instances
      const getHealthyInstances = (): InstanceState[] => {
        return instances.filter((inst) => inst.healthy);
      };

      // Select instance based on type
      const selectInstance = (type: string): InstanceState | null => {
        const healthy = getHealthyInstances();
        if (healthy.length === 0) return null;

        if (type === "round") {
          const selected = healthy[roundRobinIndex % healthy.length];
          roundRobinIndex = (roundRobinIndex + 1) % healthy.length;
          return selected;
        } else {
          // Default: random
          const idx = Math.floor(Math.random() * healthy.length);
          return healthy[idx];
        }
      };

      // Generic forward request function
      const forwardRequest = async (
        apiPath: string,
        body: Record<string, any>,
        type: string = "round",
        timeout: number = 60000
      ) => {
        const instance = selectInstance(type);
        if (!instance) {
          return { status: 503, error: "No healthy instances available" };
        }

        try {
          const response = await axios.post(
            `${instance.endpoint}${apiPath}`,
            body,
            {
              headers: { "Content-Type": "application/json" },
              timeout: timeout + 10000,
            }
          );

          return {
            status: 200,
            data: {
              ...response.data,
              instance: instance.name,
              endpoint: instance.endpoint,
              dispatchType: type,
            },
          };
        } catch (error: any) {
          const errMsg = error.response?.data?.error || error.message;
          return {
            status: error.response?.status || 500,
            error: errMsg,
            instance: instance.name,
          };
        }
      };

      // Create Express app
      const app = express();
      app.use(express.json());

      // Health endpoint
      app.get("/api/health", (_req, res) => {
        const healthy = getHealthyInstances();
        res.json({
          status: "ok",
          instances: {
            total: instances.length,
            healthy: healthy.length,
            list: instances.map((inst) => ({
              name: inst.name,
              healthy: inst.healthy,
              endpoint: inst.endpoint,
            })),
          },
        });
      });

      // Run dispatch endpoint
      app.post("/api/run", async (req, res) => {
        const { url, script, timeout = 60000, type = "round" } = req.body;

        if (!url || !script) {
          res.status(400).json({ success: false, error: "Missing url or script" });
          return;
        }

        const result = await forwardRequest("/api/run", { url, script, timeout }, type, timeout);
        if (result.error) {
          res.status(result.status).json({ success: false, error: result.error, instance: result.instance });
        } else {
          res.json(result.data);
        }
      });

      // A11y dispatch endpoint
      app.post("/api/a11y", async (req, res) => {
        const { url, selector, timeout = 10000, type = "round" } = req.body;

        if (!url) {
          res.status(400).json({ success: false, error: "Missing url" });
          return;
        }

        const result = await forwardRequest("/api/a11y", { url, selector, timeout }, type, timeout);
        if (result.error) {
          res.status(result.status).json({ success: false, error: result.error, instance: result.instance });
        } else {
          res.json(result.data);
        }
      });

      // Start server
      const server = app.listen(port, "0.0.0.0", () => {
        console.log("");
        console.log(`Dispatch server running on http://0.0.0.0:${port}`);
        console.log(`Instances: ${instances.map((i) => i.name).join(", ")}`);
        console.log(`Health check interval: ${healthInterval / 1000}s`);
        console.log("");
        console.log("Endpoints:");
        console.log(`  POST /api/run    - Dispatch script execution`);
        console.log(`  POST /api/a11y   - Dispatch accessibility tree request`);
        console.log(`  GET  /api/health - Check dispatch server status`);
        console.log("");
      });

      // Graceful shutdown
      const shutdown = () => {
        console.log("\nShutting down...");
        clearInterval(healthTimer);
        server.close(() => {
          console.log("Dispatch server stopped");
          process.exit(0);
        });
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
}
