import { Command } from "commander";
import axios from "axios";
import * as fs from "fs";
import { InstanceManager } from "../../src/utils/InstanceManager";
import { InstanceSelector } from "../utils/InstanceSelector";
import { isProcessRunning } from "../utils/process";

export function registerCookiesCommands(program: Command): void {
  const cookiesCommand = program
    .command("cookies")
    .description("Manage cookies");

  // Cookies export subcommand
  cookiesCommand
    .command("export <domain> [file]")
    .description("Export cookies from browser context")
    .option("--use <name>", "Use specific named instance")
    .option("--random", "Randomly select a running instance")
    .addHelpText(
      "after",
      `
Arguments:
  domain                Domain to filter cookies (use "all" for all cookies)
  file                  Output JSON file path (optional, prints to stdout if omitted)

Options:
  --use <name>          Use specific instance by name
  --random              Random selection from available instances

Examples:
  # Export all cookies to file
  $ pageflow cookies export all cookies.json

  # Export cookies for specific domain
  $ pageflow cookies export example.com cookies.json

  # Export to stdout
  $ pageflow cookies export all

  # Use specific instance
  $ pageflow cookies export all cookies.json --use my-browser

`,
    )
    .action(async (domain, file, options) => {
      const instanceManager = new InstanceManager();
      const selector = new InstanceSelector(instanceManager);
      const { endpoint: apiEndpoint } = await selector.select(options);

      try {
        const response = await axios.get(`${apiEndpoint}/api/cookies`, {
          params: { domain },
        });

        const cookies = response.data.cookies;

        if (file) {
          fs.writeFileSync(file, JSON.stringify(cookies, null, 2), "utf-8");
          console.error(`Exported ${cookies.length} cookies to ${file}`);
        } else {
          console.log(JSON.stringify(cookies, null, 2));
        }
      } catch (error: any) {
        if (error.response) {
          console.error(
            `Error: HTTP ${error.response.status} - ${error.response.data?.error || error.message}`,
          );
        } else {
          console.error(`Error: ${error.message}`);
        }
        process.exit(1);
      }
    });

  // Cookies add subcommand
  cookiesCommand
    .command("add <file>")
    .description("Import cookies to browser context")
    .option("--use <name>", "Use specific named instance")
    .option("--random", "Randomly select a running instance")
    .addHelpText(
      "after",
      `
Arguments:
  file                  JSON file containing cookies array

Options:
  --use <name>          Use specific instance by name
  --random              Random selection from available instances

Examples:
  # Import cookies from file
  $ pageflow cookies add cookies.json

  # Import to specific instance
  $ pageflow cookies add cookies.json --use my-browser

JSON Format:
  [
    {
      "name": "session_id",
      "value": "abc123",
      "domain": ".example.com",
      "path": "/",
      "expires": 1234567890,
      "httpOnly": true,
      "secure": true,
      "sameSite": "Lax"
    }
  ]

`,
    )
    .action(async (file, options) => {
      const instanceManager = new InstanceManager();

      // Check if file exists
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }

      // Read and parse cookies file
      let cookies;
      try {
        const content = fs.readFileSync(file, "utf-8");
        cookies = JSON.parse(content);
        if (!Array.isArray(cookies)) {
          console.error("Error: JSON file must contain an array of cookies");
          process.exit(1);
        }
      } catch (error: any) {
        console.error(`Error reading/parsing file: ${error.message}`);
        process.exit(1);
      }

      // Instance selection
      const selector = new InstanceSelector(instanceManager);
      const { endpoint: apiEndpoint } = await selector.select(options);

      try {
        const response = await axios.post(`${apiEndpoint}/api/cookies`, {
          cookies,
        });

        console.error(response.data.message);
      } catch (error: any) {
        if (error.response) {
          console.error(
            `Error: HTTP ${error.response.status} - ${error.response.data?.error || error.message}`,
          );
        } else {
          console.error(`Error: ${error.message}`);
        }
        process.exit(1);
      }
    });

  // Cookies sync subcommand
  cookiesCommand
    .command("sync")
    .description("Sync cookies from one instance to another")
    .requiredOption("--from <name>", "Source instance name")
    .option("--to <name>", "Target instance name")
    .option("--domain <domain>", "Domain to filter cookies (default: all)", "all")
    .option("--auto <mode>", "Auto sync mode: start or stop")
    .option("--interval <seconds>", "Auto sync interval in seconds (default: 15)", "15")
    .option("--task <number>", "Task number to stop (use with --auto stop)", parseInt)
    .addHelpText(
      "after",
      `
Options:
  --from <name>         Source instance to export cookies from
  --to <name>           Target instance to import cookies to
  --domain <domain>     Domain to filter cookies (default: all)
  --auto <start|stop>   Enable/disable automatic sync
  --interval <seconds>  Auto sync interval in seconds (default: 15)
  --task <number>       Task number to stop (use with --auto stop)

Examples:
  # Sync all cookies once
  $ pageflow cookies sync --from default --to test

  # Sync only xiaohongshu.com cookies
  $ pageflow cookies sync --from default --to test --domain xiaohongshu.com

  # Start auto-sync with default interval (15 seconds)
  $ pageflow cookies sync --from default --to test --auto start

  # Start auto-sync with custom interval
  $ pageflow cookies sync --from default --to test --domain xiaohongshu.com --auto start --interval 30

  # Stop auto-sync by specifying target and domain
  $ pageflow cookies sync --from default --to test --auto stop

  # Stop auto-sync by task number
  $ pageflow cookies sync --from default --auto stop --task 1

`,
    )
    .action(async (options) => {
      const instanceManager = new InstanceManager();
      const fromName = options.from;
      const toName = options.to;
      const domain = options.domain;
      const autoMode = options.auto;
      const interval = parseInt(options.interval, 10);
      const taskNumber = options.task;

      // Validate from instance
      const fromInstance = instanceManager.getInstance(fromName);
      if (!fromInstance) {
        console.error(`Error: Instance "${fromName}" does not exist`);
        process.exit(1);
      }
      if (fromInstance.type === "local") {
        const isRunning = await isProcessRunning(fromInstance.pid);
        if (!isRunning) {
          console.error(`Error: Source instance "${fromName}" is not running`);
          process.exit(1);
        }
      }

      const fromEndpoint = instanceManager.getInstanceUrl(fromInstance);

      // Handle stop by task number
      if (autoMode === "stop" && taskNumber) {
        try {
          const response = await axios.get(`${fromEndpoint}/api/jobs?type=cookie-sync`, { timeout: 2000 });
          const jobs = response.data.jobs;

          if (!jobs || jobs.length === 0) {
            console.error(`Error: No cookie-sync jobs found`);
            process.exit(1);
          }

          if (taskNumber < 1 || taskNumber > jobs.length) {
            console.error(`Error: Task number ${taskNumber} is out of range (1-${jobs.length})`);
            process.exit(1);
          }

          const job = jobs[taskNumber - 1];
          console.error(`Stopping cookie-sync job #${taskNumber} (name: ${job.name})...`);

          await axios.delete(`${fromEndpoint}/api/jobs/${job.id}`);
          console.error(`Cookie-sync job stopped and deleted successfully`);
          return;
        } catch (error: any) {
          if (error.response) {
            console.error(`Error: HTTP ${error.response.status} - ${error.response.data?.error || error.message}`);
          } else {
            console.error(`Error: ${error.message}`);
          }
          process.exit(1);
        }
      }

      // Validate to instance for other modes
      if (!toName && autoMode !== "stop") {
        console.error(`Error: --to option is required`);
        process.exit(1);
      }

      let toEndpoint = "";
      if (toName) {
        const toInstance = instanceManager.getInstance(toName);
        if (!toInstance) {
          console.error(`Error: Instance "${toName}" does not exist`);
          process.exit(1);
        }
        if (toInstance.type === "local") {
          const isRunning = await isProcessRunning(toInstance.pid);
          if (!isRunning) {
            console.error(`Error: Target instance "${toName}" is not running`);
            process.exit(1);
          }
        }
        toEndpoint = instanceManager.getInstanceUrl(toInstance);
      }

      try {
        // Handle auto-sync mode
        if (autoMode === "start") {
          console.error(`Starting auto-sync from "${fromName}" to "${toName}" (interval: ${interval}s, domain: ${domain})...`);

          const jobName = `sync-${fromName}-to-${toName}-${domain}`;
          const createResponse = await axios.post(`${fromEndpoint}/api/jobs`, {
            type: "cookie-sync",
            name: jobName,
            config: { targetUrl: toEndpoint, domain },
            interval,
          });

          const job = createResponse.data;
          await axios.post(`${fromEndpoint}/api/jobs/${job.id}/start`);

          console.error(`Auto-sync started successfully`);
          console.error(`- Job ID: ${job.id}`);
          console.error(`- Job Name: ${job.name}`);
          console.error(`Use 'pageflow jobs list' to view all jobs`);
        } else if (autoMode === "stop") {
          console.error(`Stopping auto-sync from "${fromName}" to "${toName}"...`);

          const response = await axios.get(`${fromEndpoint}/api/jobs?type=cookie-sync`, { timeout: 2000 });
          const jobs = response.data.jobs;

          const matchingJob = jobs.find((j: any) =>
            j.config.targetUrl === toEndpoint && j.config.domain === domain
          );

          if (!matchingJob) {
            console.error(`Error: No matching auto-sync job found`);
            process.exit(1);
          }

          await axios.delete(`${fromEndpoint}/api/jobs/${matchingJob.id}`);
          console.error(`Auto-sync stopped and deleted successfully`);
        } else {
          // One-time sync
          console.error(`Syncing cookies from "${fromName}" to "${toName}"...`);

          const response = await axios.post(`${fromEndpoint}/api/cookies/push`, {
            targetUrl: toEndpoint,
            domain,
          });

          const result = response.data;
          if (result.count === 0) {
            console.error(`No cookies found to sync`);
          } else {
            console.error(`Successfully synced ${result.count} cookies`);
          }
        }
      } catch (error: any) {
        if (error.response) {
          console.error(
            `Error: HTTP ${error.response.status} - ${error.response.data?.error || error.message}`,
          );
        } else {
          console.error(`Error: ${error.message}`);
        }
        process.exit(1);
      }
    });
}
