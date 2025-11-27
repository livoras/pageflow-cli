import axios from "axios";
import { InstanceManager } from "../../src/utils/InstanceManager";
import { isProcessRunning, getProcessEnv } from "../utils/process";
import { formatTimeAgo, checkCdpEndpoint } from "../utils/helpers";

/**
 * Show server status
 */
export async function showStatus(): Promise<void> {
  const instanceManager = new InstanceManager();
  const instances = instanceManager.getAllInstances();

  if (instances.length === 0) {
    console.error("No running instances");
    return;
  }

  // Sort instances: default first, then others alphabetically
  instances.sort((a, b) => {
    if (a.name === "default") return -1;
    if (b.name === "default") return 1;
    return a.name.localeCompare(b.name);
  });

  console.error(`Pageflow Instance Status (Total: ${instances.length}):\n`);

  for (const instance of instances) {
    console.error(`\x1b[1;92m[${instance.name}]\x1b[0m`);

    if (instance.type === "local") {
      const isRunning = await isProcessRunning(instance.pid);
      let statusText = isRunning ? "\x1b[1;36mRunning\x1b[0m" : "\x1b[1;91mStopped\x1b[0m";

      console.error(`- Type: Local instance`);

      console.error(`- Status: ${statusText}`);

      // Show headless mode if available
      if (instance.headless !== undefined) {
        const modeText = instance.headless ? "Headless" : "Visible";
        console.error(`- Mode: ${modeText}`);
      }

      const env = getProcessEnv(instance.pid);
      // Use stored CDP endpoint or fall back to process env
      const cdpEndpoint = instance.cdpEndpoint || env.CDP_ENDPOINT;

      // Check CDP health if endpoint exists (independent of process status)
      let cdpHealthy = true;
      if (cdpEndpoint) {
        cdpHealthy = await checkCdpEndpoint(cdpEndpoint);
      }
      console.error(`- PID: ${instance.pid}`);
      console.error(`- Port: ${instance.port}`);
      console.error(`- URL: http://localhost:${instance.port}`);
      console.error(`- User Data: ${instance.userDataDir}`);
      console.error(
        `- Started at: ${new Date(instance.startedAt).toLocaleString("en-US")}`,
      );

      if (cdpEndpoint) {
        const healthMark = cdpHealthy
          ? "\x1b[1;36mConnected\x1b[0m"
          : "\x1b[1;91mDisconnected\x1b[0m";
        console.error(`- \x1b[4mCDP: ${cdpEndpoint}\x1b[0m [${healthMark}]`);
      }

      // Show jobs if instance is running
      if (isRunning) {
        try {
          const response = await axios.get(
            `http://localhost:${instance.port}/api/jobs`,
            { timeout: 2000 },
          );
          const jobs = response.data.jobs;
          if (jobs && jobs.length > 0) {
            console.error(`- Jobs:`);

            jobs.forEach((job: any) => {
              const statusText = job.enabled ? "\x1b[1;32mRunning\x1b[0m" : "\x1b[1;31mStopped\x1b[0m";
              const lastRunText = job.lastRunAt
                ? formatTimeAgo(new Date(job.lastRunAt))
                : "not yet";
              const intervalText = `${job.interval}s`;

              console.error(`  • \x1b[1m${job.id.substring(0, 6)}\x1b[0m [${statusText}] ${job.type} - ${job.name}`);
              console.error(`    Interval: ${intervalText} | Runs: ${job.runCount} | Last: ${lastRunText}`);
              if (job.config?.webhookUrl) {
                const webhookStats = `(\x1b[32m${job.webhookSuccessCount || 0} succeed\x1b[0m, \x1b[31m${job.webhookFailureCount || 0} failed\x1b[0m)`;
                console.error(`    \x1b[4mWebhook: ${job.config.webhookUrl}\x1b[0m ${webhookStats}`);
              }
            });
          }
        } catch (error: any) {
          if (error.response?.status === 404) {
            // Instance doesn't support jobs API (old version)
          } else {
            const serverError = error.response?.data?.error;
            console.error(`- Jobs: \x1b[1;91mError: ${serverError || error.message}\x1b[0m`);
          }
        }
      }
    } else {
      console.error(`- Type: Remote server`);
      console.error(`- Status: \x1b[1;36mRunning\x1b[0m`);
      console.error(`- URL: ${instance.url}`);
      console.error(
        `- Added at: ${new Date(instance.addedAt).toLocaleString("en-US")}`,
      );

      // Show jobs for remote server
      try {
        const response = await axios.get(`${instance.url}/api/jobs`, {
          timeout: 2000,
        });
        const jobs = response.data.jobs;
        if (jobs && jobs.length > 0) {
          console.error(`- Jobs:`);

          jobs.forEach((job: any) => {
            const statusText = job.enabled
              ? "\x1b[1;32mRunning\x1b[0m"
              : "\x1b[1;31mStopped\x1b[0m";
            const lastRunText = job.lastRunAt
              ? formatTimeAgo(new Date(job.lastRunAt))
              : "not yet";
            const intervalText = `${job.interval}s`;

            console.error(
              `  • \x1b[1m${job.id.substring(0, 6)}\x1b[0m [${statusText}] ${job.type} - ${job.name}`,
            );
            console.error(
              `    Interval: ${intervalText} | Runs: ${job.runCount} | Last: ${lastRunText}`,
            );
            if (job.config?.webhookUrl) {
              const webhookStats = `(\x1b[32m${job.webhookSuccessCount || 0} succeed\x1b[0m, \x1b[31m${job.webhookFailureCount || 0} failed\x1b[0m)`;
              console.error(`    \x1b[4mWebhook: ${job.config.webhookUrl}\x1b[0m ${webhookStats}`);
            }
          });
        }
      } catch (error: any) {
        if (error.response?.status === 404) {
          // Instance doesn't support jobs API (old version)
        } else {
          console.error(`- Jobs: \x1b[1;91mError: ${error.message}\x1b[0m`);
        }
      }
    }

    console.error("");
  }
}
