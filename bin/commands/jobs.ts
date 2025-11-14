import { Command } from "commander";
import axios from "axios";
import * as fs from "fs";
import { InstanceManager } from "../../src/utils/InstanceManager";
import { isProcessRunning } from "../utils/process";

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function registerJobsCommands(program: Command): void {
  const jobs = program
    .command("jobs")
    .description("Manage background jobs (cookie-sync, extraction)");

  jobs
    .command("create <type>")
    .description("Create a new background job")
    .requiredOption("--name <name>", "Job name")
    .requiredOption("--config <json>", "Job configuration (JSON string or file path)")
    .requiredOption("--interval <seconds>", "Job interval in seconds", parseInt)
    .option("--use <name>", "Use specific named instance")
    .addHelpText(
      "after",
      `
Job Types:
  cookie-sync    Sync cookies between instances
  extraction     Extract data from URLs

Examples:
  # Create cookie-sync job
  $ pageflow jobs create cookie-sync \\
      --name "sync-to-test" \\
      --config '{"targetUrl":"http://localhost:3101","domain":"all"}' \\
      --interval 15

  # Create extraction job
  $ pageflow jobs create extraction \\
      --name "monitor-prices" \\
      --config '{"url":"https://example.com","extraction":{"schema":{...}},"scrolls":0,"delay":0}' \\
      --interval 300
`,
    )
    .action(async (type, options) => {
      const instanceManager = new InstanceManager();
      const instanceName = options.use || "default";
      const instance = instanceManager.getInstance(instanceName);

      if (!instance) {
        console.error(`Error: Instance "${instanceName}" does not exist`);
        process.exit(1);
      }

      if (instance.type === "local") {
        const isRunning = await isProcessRunning(instance.pid);
        if (!isRunning) {
          console.error(`Error: Instance "${instanceName}" is not running`);
          process.exit(1);
        }
      }

      const apiEndpoint = instanceManager.getInstanceUrl(instance);

      let config;
      try {
        if (fs.existsSync(options.config)) {
          config = JSON.parse(fs.readFileSync(options.config, "utf-8"));
        } else {
          config = JSON.parse(options.config);
        }
      } catch (error: any) {
        console.error(`Error: Invalid config JSON - ${error.message}`);
        process.exit(1);
      }

      try {
        const response = await axios.post(`${apiEndpoint}/api/jobs`, {
          type,
          name: options.name,
          config,
          interval: options.interval,
        });

        const job = response.data;
        console.error(`Job created successfully`);
        console.error(`- ID: ${job.id}`);
        console.error(`- Type: ${job.type}`);
        console.error(`- Name: ${job.name}`);
        console.error(`- Interval: ${job.interval}s`);
        console.error(`- Status: ${job.enabled ? "Enabled" : "Disabled"}`);
        console.error(`\nUse 'pageflow jobs start ${job.id}' to start the job`);
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

  jobs
    .command("show <id>")
    .description("Show job details")
    .option("--use <name>", "Use specific named instance")
    .action(async (id, options) => {
      const instanceManager = new InstanceManager();
      const { instance, apiEndpoint } = await findJobInstance(instanceManager, id, options.use);

      try {
        const response = await axios.get(`${apiEndpoint}/api/jobs/${id}`);
        const job = response.data;

        console.log(`\nJob Details (Instance: ${instance.name}):\n`);
        console.log(`ID:                 ${job.id}`);
        console.log(`Type:               ${job.type}`);
        console.log(`Name:               ${job.name}`);
        console.log(`Status:             ${job.enabled ? "Running" : "Stopped"}`);
        console.log(`Interval:           ${job.interval}s`);
        console.log(`Run Count:          ${job.runCount}`);
        console.log(`Last Run:           ${job.lastRunAt ? new Date(job.lastRunAt).toISOString() : "never"}`);
        console.log(`Created:            ${new Date(job.createdAt).toISOString()}`);
        console.log(`Webhook Success:    ${job.webhookSuccessCount || 0}`);
        console.log(`Webhook Failure:    ${job.webhookFailureCount || 0}`);
        console.log(`\nConfiguration:\n`);
        console.log(JSON.stringify(job.config, null, 2));
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

  jobs
    .command("list")
    .description("List all jobs")
    .option("--use <name>", "Use specific named instance")
    .option("--type <type>", "Filter by job type")
    .action(async (options) => {
      const instanceManager = new InstanceManager();

      // If --use is specified, only show jobs from that instance
      if (options.use) {
        const instance = instanceManager.getInstance(options.use);

        if (!instance) {
          console.error(`Error: Instance "${options.use}" does not exist`);
          process.exit(1);
        }

        if (instance.type === "local") {
          const isRunning = await isProcessRunning(instance.pid);
          if (!isRunning) {
            console.error(`Error: Instance "${options.use}" is not running`);
            process.exit(1);
          }
        }

        const apiEndpoint = instanceManager.getInstanceUrl(instance);

        try {
          const params = options.type ? { type: options.type } : {};
          const response = await axios.get(`${apiEndpoint}/api/jobs`, { params });
          const jobs = response.data.jobs;

          if (jobs.length === 0) {
            console.log("No jobs found");
            console.log("\nCreate a job with: pageflow jobs create <type>");
            return;
          }

          console.log(`\nTotal ${jobs.length} jobs in instance "${options.use}":\n`);
          console.log(`${"ID".padEnd(8)} ${"Type".padEnd(15)} ${"Name".padEnd(26)} ${"Status".padEnd(10)} ${"Interval".padEnd(12)} ${"Runs".padEnd(8)} Last`);
          console.log("-".repeat(108));

          for (const job of jobs) {
            const id = job.id.substring(0, 6).padEnd(8);
            const type = job.type.padEnd(15);
            const name = job.name.substring(0, 24).padEnd(26);
            const statusText = job.enabled ? "Running" : "Stopped";
            const statusColor = job.enabled ? "\x1b[1;32m" : "\x1b[1;90m";
            const status = `${statusColor}${statusText}\x1b[0m`.padEnd(10 + 13);
            const interval = `${job.interval}s`.padEnd(12);
            const runs = String(job.runCount).padEnd(8);
            const lastRun = job.lastRunAt
              ? formatTimeAgo(new Date(job.lastRunAt))
              : "not yet";
            console.log(`${id} ${type} ${name} ${status} ${interval} ${runs} ${lastRun}`);
          }
          console.log();
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
        return;
      }

      // No --use specified: show jobs from all running instances
      const instances = instanceManager.getAllInstances();
      const allJobs: Array<{ job: any; instanceName: string }> = [];

      for (const instance of instances) {
        // Skip if instance is not running
        if (instance.type === "local") {
          const isRunning = await isProcessRunning(instance.pid);
          if (!isRunning) continue;
        }

        const apiEndpoint = instanceManager.getInstanceUrl(instance);

        try {
          const params = options.type ? { type: options.type } : {};
          const response = await axios.get(`${apiEndpoint}/api/jobs`, {
            params,
            timeout: 2000
          });
          const jobs = response.data.jobs;

          for (const job of jobs) {
            allJobs.push({ job, instanceName: instance.name });
          }
        } catch (error: any) {
          // Skip instances that don't support jobs API or are unreachable
          if (error.response?.status !== 404) {
            console.error(`Warning: Failed to get jobs from ${instance.name}: ${error.message}`);
          }
        }
      }

      if (allJobs.length === 0) {
        console.log("No jobs found");
        console.log("\nCreate a job with: pageflow jobs create <type>");
        return;
      }

      console.log(`\nTotal ${allJobs.length} jobs:\n`);
      console.log(`${"ID".padEnd(8)} ${"Instance".padEnd(12)} ${"Type".padEnd(15)} ${"Name".padEnd(20)} ${"Status".padEnd(10)} ${"Interval".padEnd(12)} ${"Runs".padEnd(8)} Last`);
      console.log("-".repeat(120));

      for (const { job, instanceName } of allJobs) {
        const id = job.id.substring(0, 6).padEnd(8);
        const instance = instanceName.substring(0, 10).padEnd(12);
        const type = job.type.padEnd(15);
        const name = job.name.substring(0, 18).padEnd(20);
        const statusText = job.enabled ? "Running" : "Stopped";
        const statusColor = job.enabled ? "\x1b[1;32m" : "\x1b[1;90m";
        const status = `${statusColor}${statusText}\x1b[0m`.padEnd(10 + 13);
        const interval = `${job.interval}s`.padEnd(12);
        const runs = String(job.runCount).padEnd(8);
        const lastRun = job.lastRunAt
          ? formatTimeAgo(new Date(job.lastRunAt))
          : "not yet";
        console.log(`${id} ${instance} ${type} ${name} ${status} ${interval} ${runs} ${lastRun}`);
      }
      console.log();
    });

  // Helper function to find job instance
  async function findJobInstance(instanceManager: InstanceManager, jobId: string, specifiedInstance?: string): Promise<{ instance: any; apiEndpoint: string }> {
    // If instance is specified, use it directly
    if (specifiedInstance) {
      const instance = instanceManager.getInstance(specifiedInstance);
      if (!instance) {
        console.error(`Error: Instance "${specifiedInstance}" does not exist`);
        process.exit(1);
      }

      if (instance.type === "local") {
        const isRunning = await isProcessRunning(instance.pid);
        if (!isRunning) {
          console.error(`Error: Instance "${specifiedInstance}" is not running`);
          process.exit(1);
        }
      }

      const apiEndpoint = instanceManager.getInstanceUrl(instance);
      return { instance, apiEndpoint };
    }

    // No instance specified: search all running instances
    const instances = instanceManager.getAllInstances();
    const found: Array<{ instance: any; apiEndpoint: string }> = [];

    for (const instance of instances) {
      // Skip if instance is not running
      if (instance.type === "local") {
        const isRunning = await isProcessRunning(instance.pid);
        if (!isRunning) continue;
      }

      const apiEndpoint = instanceManager.getInstanceUrl(instance);

      try {
        const response = await axios.get(`${apiEndpoint}/api/jobs/${jobId}`, { timeout: 2000 });
        if (response.status === 200) {
          found.push({ instance, apiEndpoint });
        }
      } catch (error: any) {
        // Job not found in this instance, continue
      }
    }

    if (found.length === 0) {
      console.error(`Error: Job ${jobId} not found in any running instance`);
      console.error(`Use --use <name> to specify instance, or check job ID with: pageflow jobs list`);
      process.exit(1);
    }

    if (found.length > 1) {
      console.error(`Error: Job ${jobId} found in multiple instances: ${found.map(f => f.instance.name).join(", ")}`);
      console.error(`Use --use <name> to specify which instance`);
      process.exit(1);
    }

    return found[0];
  }

  jobs
    .command("start <id>")
    .description("Start a job")
    .option("--use <name>", "Use specific named instance")
    .action(async (id, options) => {
      const instanceManager = new InstanceManager();
      const { instance, apiEndpoint } = await findJobInstance(instanceManager, id, options.use);

      try {
        const response = await axios.post(`${apiEndpoint}/api/jobs/${id}/start`);
        console.error(`Job started successfully`);
        console.error(`- Instance: ${instance.name}`);
        console.error(`- ID: ${response.data.id}`);
        console.error(`- Type: ${response.data.type}`);
        console.error(`- Name: ${response.data.name}`);
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

  jobs
    .command("stop <id>")
    .description("Stop a job")
    .option("--use <name>", "Use specific named instance")
    .action(async (id, options) => {
      const instanceManager = new InstanceManager();
      const { instance, apiEndpoint } = await findJobInstance(instanceManager, id, options.use);

      try {
        const response = await axios.post(`${apiEndpoint}/api/jobs/${id}/stop`);
        console.error(`Job stopped successfully`);
        console.error(`- Instance: ${instance.name}`);
        console.error(`- ID: ${response.data.id}`);
        console.error(`- Type: ${response.data.type}`);
        console.error(`- Name: ${response.data.name}`);
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

  jobs
    .command("delete <id>")
    .description("Delete a job")
    .option("--use <name>", "Use specific named instance")
    .action(async (id, options) => {
      const instanceManager = new InstanceManager();
      const { instance, apiEndpoint } = await findJobInstance(instanceManager, id, options.use);

      try {
        await axios.delete(`${apiEndpoint}/api/jobs/${id}`);
        console.error(`Job deleted successfully`);
        console.error(`- Instance: ${instance.name}`);
        console.error(`- ID: ${id}`);
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

  jobs
    .command("config <id>")
    .description("Update job configuration")
    .requiredOption("--key <key>", "Configuration key to update (use dot notation for nested keys)")
    .requiredOption("--value <value>", "New value (JSON string for complex values)")
    .option("--use <name>", "Use specific named instance")
    .addHelpText(
      "after",
      `
Examples:
  $ pageflow jobs config abc123 --key targetUrl --value "http://localhost:9999"
  $ pageflow jobs config abc123 --key domain --value "example.com"
  $ pageflow jobs config abc123 --key extraction.schema --value '{"title":"h1"}'
      `,
    )
    .action(async (id, options) => {
      const instanceManager = new InstanceManager();
      const { instance, apiEndpoint } = await findJobInstance(instanceManager, id, options.use);

      let value = options.value;
      try {
        value = JSON.parse(options.value);
      } catch {
        // Keep as string if not valid JSON
      }

      try {
        const response = await axios.patch(`${apiEndpoint}/api/jobs/${id}/config`, {
          key: options.key,
          value: value,
        });

        console.error(`Job config updated successfully`);
        console.error(`- Instance: ${instance.name}`);
        console.error(`- ID: ${response.data.id}`);
        console.error(`- Type: ${response.data.type}`);
        console.error(`- Name: ${response.data.name}`);
        console.error(`- Enabled: ${response.data.enabled}`);
        console.error(`\nUpdated config:`);
        console.log(JSON.stringify(response.data.config, null, 2));
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

  jobs
    .command("interval <id> <interval>")
    .description("Update job interval (in seconds)")
    .option("--use <name>", "Use specific named instance")
    .addHelpText(
      "after",
      `
Examples:
  $ pageflow jobs interval abc123 120
  $ pageflow jobs interval abc123 60 --use tago
      `,
    )
    .action(async (id, intervalStr, options) => {
      const instanceManager = new InstanceManager();
      const { instance, apiEndpoint } = await findJobInstance(instanceManager, id, options.use);

      const interval = parseInt(intervalStr, 10);
      if (isNaN(interval) || interval <= 0) {
        console.error("Error: Interval must be a positive number");
        process.exit(1);
      }

      try {
        const response = await axios.patch(`${apiEndpoint}/api/jobs/${id}/interval`, {
          interval: interval,
        });

        console.error(`Job interval updated successfully`);
        console.error(`- Instance: ${instance.name}`);
        console.error(`- ID: ${response.data.id}`);
        console.error(`- Type: ${response.data.type}`);
        console.error(`- Name: ${response.data.name}`);
        console.error(`- Interval: ${response.data.interval}s`);
        console.error(`- Enabled: ${response.data.enabled}`);
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
