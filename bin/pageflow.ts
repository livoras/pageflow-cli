#!/usr/bin/env node
/**
 * Pageflow CLI - Browser automation and web data extraction tool
 */

import { Command } from "commander";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn, execSync } from "child_process";
import { InstanceManager } from "../src/utils/InstanceManager";
import { Extractor } from "xtor";
import packageJson from "../package.json";
import { InstanceSelector } from "./utils/InstanceSelector";
import { isProcessRunning, getProcessEnv } from "./utils/process";
import { registerBrowserCommands } from "./commands/browser";
import { registerCookiesCommands } from "./commands/cookies";
import { registerExtractionCommands } from "./commands/extraction";
import { registerJobsCommands } from "./commands/jobs";

// ============================================================================
// Types
// ============================================================================



interface ApiResponse {
  success: boolean;
  html?: string;
  extractions?: ExtractionTemplate[];
  error?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

function getConfigDir(): string {
  return path.join(os.homedir(), ".pageflow");
}

function getPidFilePath(): string {
  return path.join(getConfigDir(), "server.pid");
}

function getConfigFilePath(): string {
  return path.join(getConfigDir(), "server.json");
}

function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

function savePid(pid: number): void {
  ensureConfigDir();
  fs.writeFileSync(getPidFilePath(), String(pid), "utf-8");
}

function readPid(): number | null {
  const pidFile = getPidFilePath();
  if (!fs.existsSync(pidFile)) {
    return null;
  }
  const pidStr = fs.readFileSync(pidFile, "utf-8").trim();
  const pid = parseInt(pidStr, 10);
  return isNaN(pid) ? null : pid;
}

function deletePidFile(): void {
  const pidFile = getPidFilePath();
  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
}

function saveServerConfig(port: number): void {
  ensureConfigDir();
  const config = {
    port,
    url: `http://localhost:${port}`,
  };
  fs.writeFileSync(
    getConfigFilePath(),
    JSON.stringify(config, null, 2),
    "utf-8",
  );
}

function readServerConfig(): { port: number; url: string } | null {
  const configFile = getConfigFilePath();
  if (!fs.existsSync(configFile)) {
    return null;
  }
  try {
    const content = fs.readFileSync(configFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function deleteServerConfig(): void {
  const configFile = getConfigFilePath();
  if (fs.existsSync(configFile)) {
    fs.unlinkSync(configFile);
  }
}

// Moved to bin/utils/process.ts

async function checkServerHealth(
  port: number,
  timeout: number = 10000,
): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 500;

  while (Date.now() - startTime < timeout) {
    try {
      const response = await axios.get(`http://localhost:${port}/api/health`, {
        timeout: 1000,
      });
      if (response.status === 200) {
        return true;
      }
    } catch (error) {
      // Continue waiting
    }
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
  return false;
}

async function checkCdpEndpoint(cdpUrl: string): Promise<boolean> {
  try {
    const response = await axios.get(`${cdpUrl}/json/version`, {
      timeout: 5000,
    });
    return response.status === 200;
  } catch (error: any) {
    return false;
  }
}

// ============================================================================
// Server Management Functions
// ============================================================================

async function startServer(options: {
  name?: string;
  port?: number;
  headless?: boolean;
  cdp?: string;
}): Promise<void> {
  const instanceName = options.name || "default";
  const instanceManager = new InstanceManager();

  // Check if instance already exists
  const existingInstance = instanceManager.getInstance(instanceName);
  if (existingInstance) {
    const isRunning = await isProcessRunning(existingInstance.pid);
    if (isRunning) {
      console.error(`Instance "${instanceName}" is already running`);
      console.error(`- PID: ${existingInstance.pid}`);
      console.error(`- Port: ${existingInstance.port}`);
      console.error(`- URL: http://localhost:${existingInstance.port}`);
      process.exit(1);
    } else {
      // Instance exists but not running, remove stale config
      instanceManager.removeInstance(instanceName);
    }
  }

  // Check port conflict if user specified a port
  if (options.port) {
    const allInstances = instanceManager.getAllInstances();
    const portConflict = allInstances.find(
      (inst) =>
        inst.type === "local" &&
        inst.port === options.port &&
        inst.status === "running",
    );
    if (portConflict) {
      console.error(`Error: Port ${options.port} is already in use by instance "${portConflict.name}"`);
      console.error(`- PID: ${portConflict.pid}`);
      console.error(`- URL: http://localhost:${portConflict.port}`);
      process.exit(1);
    }
  }

  console.error(`Starting Pageflow instance: ${instanceName}`);

  // Get the directory where this CLI is installed
  const cliDir = path.dirname(__dirname);

  // Prefer compiled JS over TS to avoid tsx __name issue
  // Try multiple possible locations for the compiled script
  const possibleCompiledScripts = [
    path.join(cliDir, "start-server.js"), // npm installed: dist/start-server.js
    path.join(__dirname, "start-server.js"), // same directory as pageflow.js
  ];

  const possibleTsScripts = [
    path.join(__dirname, "start-server.ts"), // same directory as pageflow.ts
    path.join(cliDir, "bin/start-server.ts"), // project root + bin/
  ];

  let runtime: string;
  let serverScript: string;

  // Try to find compiled JS first
  const compiledScript = possibleCompiledScripts.find((p) => fs.existsSync(p));

  if (compiledScript) {
    // Use node to run compiled JS (avoids tsx __name issue)
    runtime = process.execPath; // node executable
    serverScript = compiledScript;
  } else {
    // Fallback to TS file
    const tsScript = possibleTsScripts.find((p) => fs.existsSync(p));
    if (tsScript) {
    // Fallback to tsx for TS file
    let tsxPath: string | null = null;
    try {
      tsxPath = execSync("which tsx", { encoding: "utf-8" }).trim();
    } catch (e) {
      // Try common locations
      const possiblePaths = [
        path.join(cliDir, "node_modules/.bin/tsx"),
        "/usr/local/bin/tsx",
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          tsxPath = p;
          break;
        }
      }
    }

    if (!tsxPath) {
      console.error("Error: Cannot find compiled server file or tsx command");
      console.error("Please install tsx: pnpm install -g tsx");
      process.exit(1);
    }

      runtime = tsxPath;
      serverScript = tsScript;
    } else {
      console.error(`Error: Cannot find server startup script`);
      console.error(`Searched locations:`);
      possibleCompiledScripts.forEach((p) =>
        console.error(`  - ${p} (${fs.existsSync(p) ? "exists" : "not found"})`),
      );
      possibleTsScripts.forEach((p) =>
        console.error(`  - ${p} (${fs.existsSync(p) ? "exists" : "not found"})`),
      );
      process.exit(1);
    }
  }

  // Spawn server process first to get PID
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: "0", // Will be updated after instance is registered
    INSTANCE_NAME: instanceName,
    HEADLESS: options.headless ? "true" : "false",
  };

  // Add CDP_ENDPOINT if --cdp is provided
  if (options.cdp) {
    env.CDP_ENDPOINT = options.cdp;
  }

  const child = spawn(runtime, [serverScript], {
    detached: true,
    stdio: "ignore",
    env,
  });

  child.unref();

  // Register instance and get assigned port
  const { port, userDataDir } = instanceManager.addInstance(
    instanceName,
    child.pid!,
    options.port,
    options.cdp,
    options.headless,
  );

  // Update environment variable for the spawned process
  const updatedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    INSTANCE_NAME: instanceName,
    USER_DATA_DIR: userDataDir,
    HEADLESS: options.headless ? "true" : "false",
  };

  // Add CDP_ENDPOINT if --cdp is provided
  if (options.cdp) {
    updatedEnv.CDP_ENDPOINT = options.cdp;
  }

  // Kill the temporary process and spawn with correct env
  process.kill(child.pid!);
  const finalChild = spawn(runtime, [serverScript], {
    detached: true,
    stdio: "ignore",
    env: updatedEnv,
  });

  finalChild.unref();

  // Update instance with final PID
  instanceManager.removeInstance(instanceName);
  instanceManager.addInstance(instanceName, finalChild.pid!, port, options.cdp, options.headless);

  console.error(`\nWaiting for server to start...`);
  const isHealthy = await checkServerHealth(port, 10000);

  if (isHealthy) {
    // Verify the process is actually running
    const processStillRunning = await isProcessRunning(finalChild.pid!);
    if (!processStillRunning) {
      console.error(`Error: Instance "${instanceName}" failed to start`);
      console.error(`Process exited immediately after launch`);
      console.error(`Possible causes: port conflict, configuration error, or startup crash`);
      instanceManager.removeInstance(instanceName);
      process.exit(1);
    }

    // If CDP endpoint is provided, verify it's accessible
    if (options.cdp) {
      console.error(`\nVerifying CDP endpoint connectivity...`);
      const cdpAccessible = await checkCdpEndpoint(options.cdp);
      if (!cdpAccessible) {
        console.error(`Error: Cannot connect to CDP endpoint: ${options.cdp}`);
        console.error(`Possible causes:`);
        console.error(`  - CDP endpoint is not accessible from this machine`);
        console.error(`  - Chrome DevTools Protocol is not enabled`);
        console.error(`  - Network firewall blocking the connection`);
        console.error(`  - Wrong URL or port`);
        console.error(`\nStopping instance "${instanceName}"...`);
        await stopInstance(instanceName);
        process.exit(1);
      }
      console.error(`CDP endpoint verified: ${options.cdp}`);
    }

    if (instanceName === "default") {
      saveServerConfig(port);
    }
    console.error(`Instance "${instanceName}" started successfully!`);
    console.error(`- PID: ${finalChild.pid}`);
    console.error(`- Port: ${port}`);
    console.error(`- URL: http://localhost:${port}`);
    console.error(`- User Data: ${userDataDir}`);
    if (options.cdp) {
      console.error(`- CDP: ${options.cdp}`);
    }
  } else {
    console.error(`Error: Instance "${instanceName}" startup timeout or failed`);
    instanceManager.removeInstance(instanceName);
    process.exit(1);
  }
}

async function stopInstance(instanceName: string): Promise<boolean> {
  const instanceManager = new InstanceManager();
  const instance = instanceManager.getInstance(instanceName);

  if (!instance) {
    console.error(`Error: Instance "${instanceName}" does not exist`);
    return false;
  }

  // Handle remote instances
  if (instance.type === "remote") {
    console.error(`Removing remote server "${instanceName}"...`);
    instanceManager.removeInstance(instanceName);
    console.error(`Remote server "${instanceName}" removed`);
    return true;
  }

  // Handle local instances
  const isRunning = await isProcessRunning(instance.pid);
  if (!isRunning) {
    console.error(`Instance "${instanceName}" process not found, cleaning up configuration`);
    instanceManager.removeInstance(instanceName);
    if (instanceName === "default") {
      deletePidFile();
      deleteServerConfig();
    }
    return true;
  }

  console.error(
    `Stopping instance "${instanceName}" (PID: ${instance.pid}, Port: ${instance.port})...`,
  );

  try {
    // Send SIGTERM first
    process.kill(instance.pid, "SIGTERM");

    // Wait for graceful shutdown
    const maxWaitTime = 10000; // 10 seconds
    const checkInterval = 500;
    let waited = 0;

    while (waited < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waited += checkInterval;

      const stillRunning = await isProcessRunning(instance.pid);
      if (!stillRunning) {
        console.error(`Instance "${instanceName}" stopped successfully`);
        instanceManager.removeInstance(instanceName);
        if (instanceName === "default") {
          deletePidFile();
          deleteServerConfig();
        }
        return true;
      }
    }

    // Force kill if still running
    console.error("Instance not responding to SIGTERM, sending SIGKILL...");
    process.kill(instance.pid, "SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.error(`Instance "${instanceName}" force stopped`);
    instanceManager.removeInstance(instanceName);
    if (instanceName === "default") {
      deletePidFile();
      deleteServerConfig();
    }
    return true;
  } catch (error: any) {
    console.error(`Error: Cannot stop instance "${instanceName}" - ${error.message}`);
    return false;
  }
}

async function restartServer(options: { name?: string }): Promise<void> {
  const instanceName = options.name || "default";
  const instanceManager = new InstanceManager();

  // Get instance configuration
  const instance = instanceManager.getInstance(instanceName);
  if (!instance) {
    console.error(`Error: Instance "${instanceName}" does not exist`);
    process.exit(1);
  }

  // Remote instances cannot be restarted
  if (instance.type === "remote") {
    console.error(`Error: Cannot restart remote server "${instanceName}"`);
    console.error("Remote servers are managed externally");
    process.exit(1);
  }

  // Save configuration before stopping
  const savedConfig = {
    port: instance.port,
    cdpEndpoint: instance.cdpEndpoint,
    headless: instance.headless,
  };

  console.error(`Restarting instance "${instanceName}"...`);

  // Check if process is running
  const isRunning = await isProcessRunning(instance.pid);

  // Stop the instance if it's running
  if (isRunning) {
    const stopSuccess = await stopInstance(instanceName);
    if (!stopSuccess) {
      console.error(`Error: Failed to stop instance "${instanceName}"`);
      process.exit(1);
    }
  } else {
    console.error(`Instance "${instanceName}" is not running, starting it...`);
    // Clean up stale configuration
    instanceManager.removeInstance(instanceName);
  }

  // Restart with saved configuration
  await startServer({
    name: instanceName,
    port: savedConfig.port,
    cdp: savedConfig.cdpEndpoint,
    headless: savedConfig.headless,
  });
}

async function stopServer(options: { names?: string[] }): Promise<void> {
  const instanceNames = options.names || [];
  const instanceManager = new InstanceManager();

  // No names specified, stop default instance
  if (instanceNames.length === 0) {
    const success = await stopInstance("default");
    if (!success) {
      process.exit(1);
    }
    return;
  }

  // Special case: "all" stops all instances
  if (instanceNames.length === 1 && instanceNames[0] === "all") {
    const instances = instanceManager.getAllInstances();

    if (instances.length === 0) {
      console.error("No running instances");
      return;
    }

    console.error(`Found ${instances.length} instances, preparing to stop...`);
    let successCount = 0;

    for (const instance of instances) {
      const success = await stopInstance(instance.name);
      if (success) {
        successCount++;
      }
    }

    console.error(`\nSuccessfully stopped ${successCount}/${instances.length} instances`);
    return;
  }

  // Stop multiple specified instances
  if (instanceNames.length > 1) {
    console.error(`Stopping ${instanceNames.length} instances...`);
    let successCount = 0;
    const failedInstances: string[] = [];

    for (const name of instanceNames) {
      const success = await stopInstance(name);
      if (success) {
        successCount++;
      } else {
        failedInstances.push(name);
      }
    }

    console.error(`\nSuccessfully stopped ${successCount}/${instanceNames.length} instances`);
    if (failedInstances.length > 0) {
      console.error(`Failed to stop: ${failedInstances.join(", ")}`);
      process.exit(1);
    }
    return;
  }

  // Stop single specified instance
  const success = await stopInstance(instanceNames[0]);
  if (!success) {
    process.exit(1);
  }
}

// Moved to bin/utils/process.ts

/**
 * Format time ago
 */
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

/**
 * Show server status
 */
async function showStatus(): Promise<void> {
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
              const statusText = job.enabled ? "\x1b[1;32mRunning\x1b[0m" : "\x1b[1;90mStopped\x1b[0m";
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
            console.error(`- Jobs: \x1b[1;91mError: ${error.message}\x1b[0m`);
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
              : "\x1b[1;90mStopped\x1b[0m";
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

// ============================================================================
// Webhook Functions
// ============================================================================


async function getHtml(url: string, apiEndpoint: string): Promise<string> {
  console.error("Fetching HTML...");
  console.error(`- URL: ${url}`);
  console.error(`- Server: ${apiEndpoint}`);

  const response = await axios.post<ApiResponse>(
    `${apiEndpoint}/api/html`,
    { url },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 60000,
    },
  );

  if (response.data.success && response.data.html) {
    const html = response.data.html;
    console.error(`Fetch successful! HTML size: ${html.length} characters`);
    return html;
  } else {
    const errorMsg = response.data.error || "Unknown error";
    console.error(`Fetch failed: ${errorMsg}`);
    process.exit(1);
  }
}


// ============================================================================
// Main CLI
// ============================================================================

async function main() {
  const program = new Command();

  program
    .name("pageflow")
    .usage("[command] [options]")
    .description("Pageflow CLI - Browser automation and web data extraction tool")
    .version(packageJson.version)
    .addHelpText(
      "after",
      `
DESCRIPTION
  Pageflow is a CLI tool for browser automation and web data extraction.
  It supports multi-instance management, local/remote server modes, and
  offline HTML data extraction using declarative schemas.

USAGE
  pageflow <command> [options]

COMMANDS
  start [name]                      Start a local Pageflow instance
  stop [name]                       Stop a Pageflow instance
  add-server <url>                  Add a remote Pageflow server
  status                            Show status of all instances
  open [url]                        Open a new browser tab
  extract [url] [id]                Extract data from a webpage
  extract-html <file> <schema>      Extract data from local HTML file

EXAMPLES
  # Start local instance
  $ pageflow start my-browser --port 3100

  # Connect to remote Chrome via CDP
  $ pageflow start --cdp http://localhost:9222

  # Extract data using template ID
  $ pageflow extract "https://example.com" 3

  # Extract with custom schema file
  $ pageflow extract --schema ./schema.json "https://example.com"

  # Save HTML for offline extraction
  $ pageflow extract --save-html "https://example.com" page.html

  # Extract from local HTML
  $ pageflow extract-html page.html schema.json > result.json

  # List available extraction templates
  $ pageflow extract --list-extractions

  # Random instance selection with interval
  $ pageflow extract "https://example.com" 3 --random --interval 5

ENVIRONMENT
  DB_PATH               Base directory for storage (default: ~/.pageflow)

  Note: Use --cdp parameter instead of CDP_ENDPOINT for CLI usage

FILES
  ~/.pageflow/instances.json        Instance registry
  ~/.pageflow/extractions/          Extraction templates directory

EXIT STATUS
  0    Success
  1    General error
  130  Interrupted by user (Ctrl+C)

DOCUMENTATION
  For more information, visit: https://github.com/livoras/pageflow

`,
    );

  // Start command
  program
    .command("start [name]")
    .description("Start a local Pageflow browser instance")
    .option("-p, --port <number>", "Server port (auto-assigned if not specified)")
    .option("--headless", "Run in headless mode (no visible browser window)")
    .option("--cdp <url>", "Connect to remote Chrome via CDP (e.g., http://localhost:9222)")
    .addHelpText(
      "after",
      `
Arguments:
  name                  Instance name (default: "default")

Description:
  Starts a local Pageflow instance with an embedded Chrome browser.
  The instance runs as a background process and can be accessed via
  HTTP API or used by the extract command.

Examples:
  # Start default instance on auto-assigned port
  $ pageflow start

  # Start named instance
  $ pageflow start my-crawler

  # Start on specific port
  $ pageflow start --port 3100

  # Start in headless mode
  $ pageflow start --headless

  # Connect to remote Chrome via CDP
  $ pageflow start --cdp http://localhost:9222

Storage:
  Instance data is stored in ~/.pageflow/<instance-name>/

`,
    )
    .action(async (name, options) => {
      const port = options.port ? parseInt(options.port, 10) : undefined;
      const headless = options.headless || false;
      const cdp = options.cdp;
      await startServer({ name, port, headless, cdp });
    });

  // Stop command
  program
    .command("stop [names...]")
    .description("Stop one or more Pageflow instances")
    .addHelpText(
      "after",
      `
Arguments:
  names                 Instance names to stop (can specify multiple)
                        Use "all" to stop all instances
                        Omit to stop the default instance

Examples:
  # Stop default instance
  $ pageflow stop

  # Stop specific instance
  $ pageflow stop my-browser

  # Stop multiple instances
  $ pageflow stop instance1 instance2 instance3

  # Stop all instances
  $ pageflow stop all

`,
    )
    .action(async (names: string[]) => {
      await stopServer({ names });
    });

  // Restart command
  program
    .command("restart [name]")
    .description("Restart a Pageflow instance with its original configuration")
    .addHelpText(
      "after",
      `
Arguments:
  name                  Instance name (default: "default")

Description:
  Restarts a local Pageflow instance, preserving its original configuration
  including port number and CDP endpoint. The instance will be stopped
  (if running) and then started again with the same settings.

Examples:
  # Restart default instance
  $ pageflow restart

  # Restart specific instance
  $ pageflow restart my-browser

Note:
  - Remote servers cannot be restarted (they are managed externally)
  - User data and browser state are preserved across restarts
  - If the instance is not running, this command will start it

`,
    )
    .action(async (name) => {
      await restartServer({ name });
    });

  // Add remote server command
  program
    .command("add-server <url>")
    .description("Add a remote Pageflow server")
    .option("-n, --name <name>", "Server name (optional, auto-generated)")
    .action(async (url, options) => {
      const instanceManager = new InstanceManager();

      try {
        // Validate URL format
        try {
          new URL(url);
        } catch {
          console.error(`Error: Invalid URL format: ${url}`);
          process.exit(1);
        }

        // Test server health
        console.error(`Testing remote server connection: ${url}`);
        try {
          const response = await axios.get(`${url}/api/health`, {
            timeout: 5000,
          });
          if (response.status !== 200) {
            console.error(`Error: Server health check failed (HTTP ${response.status})`);
            process.exit(1);
          }
        } catch (error: any) {
          console.error(`Error: Cannot connect to server: ${error.message}`);
          process.exit(1);
        }

        // Add server
        const serverName = instanceManager.addRemoteServer(url, options.name);
        console.error(`Remote server added successfully`);
        console.error(`- Name: ${serverName}`);
        console.error(`- URL: ${url}`);
      } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
    });

  // Status command
  program
    .command("status")
    .description("Show Pageflow server status")
    .action(async () => {
      await showStatus();
    });

  // Browser commands (open)
  registerBrowserCommands(program);

  // Cookies commands (export/add/sync)
  registerCookiesCommands(program);


  // Extraction commands (extract/extract-html/extraction)
  registerExtractionCommands(program);


  // Jobs commands (create/list/start/stop/delete)
  registerJobsCommands(program);

  program.parse();
}

main().catch((error) => {
  console.error("Unhandled error:", error.message);
  process.exit(1);
});
