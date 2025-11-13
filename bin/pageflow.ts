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

// ============================================================================
// Types
// ============================================================================

interface ExtractionTemplate {
  id: number;
  name: string;
  description: string;
}

interface ExtractResult {
  success: boolean;
  data?: any[];
  extractedFrom?: string;
  error?: string;
}

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

async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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

/**
 * Get environment variables of a process
 */
function getProcessEnv(pid: number): Record<string, string> {
  try {
    const result = execSync(`ps eww -p ${pid}`, {
      encoding: "utf-8",
    });
    const env: Record<string, string> = {};

    // Parse environment variables from ps output
    const envMatch = result.match(/\s+([A-Z_]+=\S+)/g);
    if (envMatch) {
      for (const pair of envMatch) {
        const trimmed = pair.trim();
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex);
          const value = trimmed.substring(eqIndex + 1);
          env[key] = value;
        }
      }
    }

    return env;
  } catch {
    return {};
  }
}

/**
 * Format time ago
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

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

      // Show auto-sync tasks if instance is running
      if (isRunning) {
        try {
          const response = await axios.get(
            `http://localhost:${instance.port}/api/cookies/auto-sync/status`,
            { timeout: 2000 },
          );
          const tasks = response.data.tasks;
          if (tasks && tasks.length > 0) {
            console.error(`- Auto-sync cookies tasks:`);

            // Calculate max widths for alignment
            const taskData = tasks.map((task: any) => {
              const targetName = instanceManager
                .getAllInstances()
                .find((i) => instanceManager.getInstanceUrl(i) === task.targetUrl)
                ?.name || task.targetUrl;
              const lastSyncText = task.lastSyncAt
                ? formatTimeAgo(new Date(task.lastSyncAt))
                : "never";
              return {
                targetName,
                domain: task.domain,
                interval: `${task.interval}s`,
                lastSync: lastSyncText,
              };
            });

            const maxTargetLen = Math.max(...taskData.map((t: any) => t.targetName.length));
            const maxDomainLen = Math.max(...taskData.map((t: any) => t.domain.length));
            const maxIntervalLen = Math.max(...taskData.map((t: any) => t.interval.length));

            for (const data of taskData) {
              console.error(
                `  \x1b[1;36m•\x1b[0m To: ${data.targetName.padEnd(maxTargetLen)} | Domain: ${data.domain.padEnd(maxDomainLen)} | Interval: ${data.interval.padStart(maxIntervalLen)} | Last sync: ${data.lastSync}`,
              );
            }
          }
        } catch (error: any) {
          if (error.response?.status === 404) {
            // Instance doesn't support auto-sync API (old version)
          } else {
            console.error(`- Auto-sync cookies tasks: \x1b[1;91mError: ${error.message}\x1b[0m`);
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
    }

    console.error("");
  }
}

// ============================================================================
// Webhook Functions
// ============================================================================

async function sendWebhook(url: string, data: any): Promise<void> {
  try {
    await axios.post(url, data, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    console.error(`Webhook delivered: ${url}`);
  } catch (error: any) {
    console.error(`Webhook failed: ${error.message}`);
  }
}

// ============================================================================
// Extraction Functions
// ============================================================================

// ============================================================================
// Extraction Template File Operations
// ============================================================================

function getExtractionsDir(): string {
  return path.join(os.homedir(), ".pageflow", "extractions");
}

function listExtractionsFromFiles(): ExtractionTemplate[] {
  const extractionsDir = getExtractionsDir();

  if (!fs.existsSync(extractionsDir)) {
    return [];
  }

  const files = fs.readdirSync(extractionsDir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => {
      const idA = parseInt(path.basename(a, '.json'), 10);
      const idB = parseInt(path.basename(b, '.json'), 10);
      return idA - idB;
    });

  const extractions: ExtractionTemplate[] = [];

  for (const file of files) {
    const filePath = path.join(extractionsDir, file);
    const id = parseInt(path.basename(file, '.json'), 10);

    if (isNaN(id)) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      extractions.push({
        id,
        name: data.name || 'Untitled',
        description: data.description || '',
      });
    } catch (error) {
      console.error(`Warning: Failed to read ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return extractions;
}

function getExtractionById(id: number): any | null {
  const extractionsDir = getExtractionsDir();
  const filePath = path.join(extractionsDir, `${id}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read extraction ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function deleteExtractionFile(id: number): boolean {
  const extractionsDir = getExtractionsDir();
  const filePath = path.join(extractionsDir, `${id}.json`);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    throw new Error(`Failed to delete extraction ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}


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

async function commonExtract(
  url: string,
  scrolls: number,
  delay: number,
  apiEndpoint: string,
  options: {
    extractionId?: number;
    schema?: any;
    strategy?: any;
    templateName?: string;
    instanceName?: string;
  },
): Promise<ExtractResult> {
  let schema: any;
  let strategy: any;
  let templateName: string;
  let templateId: string | number;

  // Determine schema source
  if (options.schema) {
    // Use provided schema directly
    schema = options.schema;
    strategy = options.strategy || null;
    templateName = options.templateName || "Custom template";
    templateId = "custom";
  } else if (options.extractionId !== undefined) {
    // Read extraction template from local file
    const extractionsDir = path.join(os.homedir(), ".pageflow", "extractions");
    const templatePath = path.join(
      extractionsDir,
      `${options.extractionId}.json`,
    );

    if (!fs.existsSync(templatePath)) {
      console.error(`Error: Extraction template ${options.extractionId} does not exist`);
      console.error(`Path: ${templatePath}`);
      process.exit(1);
    }

    let template: any;
    try {
      const templateContent = fs.readFileSync(templatePath, "utf-8");
      template = JSON.parse(templateContent);
    } catch (error: any) {
      console.error(`Error: Failed to read extraction template - ${error.message}`);
      process.exit(1);
    }

    schema = template.schema;
    strategy = template.strategy;
    templateName = template.name;
    templateId = options.extractionId;
  } else {
    console.error("Error: Must provide extractionId or schema");
    process.exit(1);
  }

  const payload = {
    url,
    scrolls,
    delay,
    extraction: {
      schema,
      strategy,
    },
  };

  console.error("Extracting data...");
  console.error(`- URL: ${url}`);
  console.error(`- Template ID: ${templateId}`);
  console.error(`- Template name: ${templateName}`);
  console.error(`- Scrolls: ${scrolls}`);
  console.error(`- Delay: ${delay}ms`);
  console.error(`- Server: ${apiEndpoint}`);

  // Show CDP info if available
  if (options.instanceName) {
    const instanceManager = new InstanceManager();
    const instance = instanceManager.getInstance(options.instanceName);
    if (instance && instance.type === "local") {
      const env = getProcessEnv(instance.pid);
      if (env.CDP_ENDPOINT) {
        console.error(`- CDP: ${env.CDP_ENDPOINT}`);
      }
    }
  }

  console.error("");

  try {
    const response = await axios.post<ExtractResult>(
      `${apiEndpoint}/api/extract`,
      payload,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 120000,
      },
    );

    const result = response.data;

    if (result.success) {
      if (Array.isArray(result.data)) {
        const dataCount = result.data.length;
        console.error(`Extraction successful! Extracted ${dataCount} items`);
      } else if (result.data && typeof result.data === 'object') {
        console.error(`Extraction successful! Extracted object data`);
      } else {
        console.error(`Extraction successful!`);
      }
    } else {
      console.error(`Extraction failed: ${JSON.stringify(result)}`);
    }

    return result;
  } catch (error: any) {
    if (error.code === "ECONNABORTED") {
      console.error("Error: Request timeout");
    } else if (error.response) {
      console.error(
        `Error: HTTP ${error.response.status} - ${error.response.data?.error || error.message}`,
      );
      console.error("Response data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(`Error: HTTP request failed - ${error.message}`);
    }
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

  // Open command
  program
    .command("open [url]")
    .description("Open a new browser tab")
    .option("--use <name>", "Use specific named instance")
    .option("--random", "Randomly select a running instance")
    .action(async (url, options) => {
      const instanceManager = new InstanceManager();
      let apiEndpoint: string;

      // Instance selection logic
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
        apiEndpoint = instanceManager.getInstanceUrl(instance);
        console.error(`Using instance: ${options.use}`);
      } else if (options.random) {
        const instance = instanceManager.getRandomInstance();
        if (!instance) {
          console.error("Error: No running instances");
          process.exit(1);
        }
        apiEndpoint = instanceManager.getInstanceUrl(instance);
        console.error(`Randomly selected instance: ${instance.name}`);
      } else {
        const instance = instanceManager.getDefaultInstance();
        if (instance) {
          apiEndpoint = instanceManager.getInstanceUrl(instance);
          console.error(`Using instance: ${instance.name}`);
        } else {
          console.error("Error: No running instances");
          process.exit(1);
        }
      }

      // Call API to open page
      try {
        const targetUrl = url || "about:blank";
        const response = await axios.post(`${apiEndpoint}/api/pages`, {
          name: `Tab-${Date.now()}`,
          url: targetUrl,
          description: `Open tab: ${targetUrl}`,
          timeout: 10000,
        });

        console.error(`Successfully opened new tab`);
        console.error(`- URL: ${response.data.url}`);
        console.error(`- Page ID: ${response.data.id}`);
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

  // Cookies command group
  const cookies = program.command("cookies").description("Manage browser cookies");

  // Cookies export subcommand
  cookies
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
      let apiEndpoint: string;

      // Instance selection logic
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
        apiEndpoint = instanceManager.getInstanceUrl(instance);
      } else if (options.random) {
        const instance = instanceManager.getRandomInstance();
        if (!instance) {
          console.error("Error: No running instances");
          process.exit(1);
        }
        apiEndpoint = instanceManager.getInstanceUrl(instance);
      } else {
        const instance = instanceManager.getDefaultInstance();
        if (instance) {
          apiEndpoint = instanceManager.getInstanceUrl(instance);
        } else {
          console.error("Error: No running instances");
          process.exit(1);
        }
      }

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
  cookies
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
      let apiEndpoint: string;

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

      // Instance selection logic
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
        apiEndpoint = instanceManager.getInstanceUrl(instance);
      } else if (options.random) {
        const instance = instanceManager.getRandomInstance();
        if (!instance) {
          console.error("Error: No running instances");
          process.exit(1);
        }
        apiEndpoint = instanceManager.getInstanceUrl(instance);
      } else {
        const instance = instanceManager.getDefaultInstance();
        if (instance) {
          apiEndpoint = instanceManager.getInstanceUrl(instance);
        } else {
          console.error("Error: No running instances");
          process.exit(1);
        }
      }

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
  cookies
    .command("sync")
    .description("Sync cookies from one instance to another")
    .requiredOption("--from <name>", "Source instance name")
    .requiredOption("--to <name>", "Target instance name")
    .option("--domain <domain>", "Domain to filter cookies (default: all)", "all")
    .option("--auto <mode>", "Auto sync mode: start or stop")
    .option("--interval <seconds>", "Auto sync interval in seconds (default: 15)", "15")
    .addHelpText(
      "after",
      `
Options:
  --from <name>         Source instance to export cookies from
  --to <name>           Target instance to import cookies to
  --domain <domain>     Domain to filter cookies (default: all)
  --auto <start|stop>   Enable/disable automatic sync
  --interval <seconds>  Auto sync interval in seconds (default: 15)

Examples:
  # Sync all cookies once
  $ pageflow cookies sync --from default --to test

  # Sync only xiaohongshu.com cookies
  $ pageflow cookies sync --from default --to test --domain xiaohongshu.com

  # Start auto-sync with default interval (15 seconds)
  $ pageflow cookies sync --from default --to test --auto start

  # Start auto-sync with custom interval
  $ pageflow cookies sync --from default --to test --domain xiaohongshu --auto start --interval 30

  # Stop auto-sync
  $ pageflow cookies sync --from default --to test --auto stop

`,
    )
    .action(async (options) => {
      const instanceManager = new InstanceManager();
      const fromName = options.from;
      const toName = options.to;
      const domain = options.domain;
      const autoMode = options.auto;
      const interval = parseInt(options.interval, 10);

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

      // Validate to instance
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

      const fromEndpoint = instanceManager.getInstanceUrl(fromInstance);
      const toEndpoint = instanceManager.getInstanceUrl(toInstance);

      try {
        // Handle auto-sync mode
        if (autoMode === "start") {
          console.error(
            `Starting auto-sync from "${fromName}" to "${toName}" (interval: ${interval}s, domain: ${domain})...`,
          );

          const response = await axios.post(
            `${fromEndpoint}/api/cookies/auto-sync/start`,
            {
              targetUrl: toEndpoint,
              domain,
              interval,
            },
          );

          console.error(response.data.message);
        } else if (autoMode === "stop") {
          console.error(
            `Stopping auto-sync from "${fromName}" to "${toName}"...`,
          );

          const response = await axios.post(
            `${fromEndpoint}/api/cookies/auto-sync/stop`,
            {
              targetUrl: toEndpoint,
              domain,
            },
          );

          console.error(response.data.message);
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

  // Extract command (default)
  program
    .command("extract [url] [extraction_id]", { isDefault: true })
    .description("Extract structured data from web pages")
    .option("--scrolls <number>", "Number of page-down scrolls to perform", "0")
    .option("--delay <ms>", "Delay in milliseconds after each scroll", "0")
    .option("--use <name>", "Use specific named instance")
    .option("--random", "Randomly select a running instance")
    .option("--interval <mins>", "Loop extraction interval in minutes", parseFloat)
    .option("--save-html", "Save page HTML (url required, extraction_id as optional file path)")
    .option("--schema <file>", "Use custom extraction template file (JSON)")
    .option("--webhook <url>", "POST extraction result to webhook URL")
    .addHelpText(
      "after",
      `
Arguments:
  url                   Target URL to extract data from
  extraction_id         Template ID or output file path (for --save-html)

Description:
  Extracts structured data from web pages using declarative schemas.
  Supports template-based extraction, custom schemas, loop extraction,
  and HTML saving for offline processing.

Data Extraction Options:
  --schema <file>       Use custom JSON schema file instead of template ID
  --scrolls <n>         Scroll page N times before extraction (default: 0)
  --delay <ms>          Wait time after each scroll (default: 0)
  --webhook <url>       POST extraction result to webhook URL (timeout: 5s)

Instance Selection:
  --use <name>          Use specific instance by name
  --random              Random selection from available instances
  (default)             Use "default" instance or remote server

HTML Operations:
  --save-html           Save page HTML instead of extracting
                        Usage: pageflow extract --save-html <url> [file]
                        Omit file to print to stdout

Loop Extraction:
  --interval <mins>     Repeat extraction every N minutes
                        Useful for monitoring dynamic content

Examples:
  # Extract using template ID
  $ pageflow extract "https://example.com/products" 3

  # Extract with custom schema
  $ pageflow extract --schema ./my-schema.json "https://example.com"

  # Extract with 5 scrolls and 1 second delay
  $ pageflow extract "https://example.com" 3 --scrolls 5 --delay 1000

  # Use specific instance
  $ pageflow extract "https://example.com" 3 --use my-crawler

  # Random instance with loop
  $ pageflow extract "https://example.com" 3 --random --interval 5

  # Save HTML for offline extraction
  $ pageflow extract --save-html "https://example.com" page.html

  # Print HTML to stdout
  $ pageflow extract --save-html "https://example.com"

Template Files:
  ~/.pageflow/extractions/<id>.json    Extraction template files

Schema Format:
  {
    "name": "Template Name",
    "schema": [...],           // xtor schema (required)
    "strategy": {              // optional
      "merge": "concat",       // concat|collect|merge
      "unique": "id"           // deduplication field
    }
  }

Output Format:
  {
    "success": true,
    "data": [...],            // extracted results
    "extractedFrom": "url"
  }

`,
    )
    .action(async (url, extractionId, options) => {
      const instanceManager = new InstanceManager();

      // Instance selection function
      const selectInstance = async (): Promise<{ endpoint: string; instanceName?: string }> => {
        if (options.use) {
          // Use instance with specified name
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
          const endpoint = instanceManager.getInstanceUrl(instance);
          console.error(`Using instance: ${options.use}`);
          return { endpoint, instanceName: options.use };
        } else if (options.random) {
          // Randomly select a running instance
          const instance = instanceManager.getRandomInstance();
          if (!instance) {
            console.error("Error: No running instances");
            process.exit(1);
          }
          const endpoint = instanceManager.getInstanceUrl(instance);
          console.error(`Randomly selected instance: ${instance.name}`);
          return { endpoint, instanceName: instance.name };
        } else {
          // No option specified, prefer default instance
          const instance = instanceManager.getDefaultInstance();
          if (instance) {
            const endpoint = instanceManager.getInstanceUrl(instance);
            console.error(`Using instance: ${instance.name}`);
            return { endpoint, instanceName: instance.name };
          } else {
            // No instance, use default remote server
            console.error("Using remote server");
            return { endpoint: "http://100.74.12.43:8006" };
          }
        }
      };

      // Initial instance selection
      let selectedInstance = await selectInstance();
      let apiEndpoint = selectedInstance.endpoint;

      // Handle --save-html option
      if (options.saveHtml) {
        if (!url) {
          console.error("Error: --save-html requires URL parameter");
          process.exit(1);
        }
        const html = await getHtml(url, apiEndpoint);
        if (extractionId) {
          // extractionId as output file path
          const outputFile = String(extractionId);
          fs.writeFileSync(outputFile, html, "utf-8");
          console.error(`\nHTML saved to: ${outputFile}`);
        } else {
          // No file specified, print to stdout
          console.log(html);
        }
        return;
      }

      // Handle extraction
      // Validate: need either --schema or extraction_id
      if (!options.schema && (extractionId === undefined || isNaN(Number(extractionId)))) {
        console.error(
          "Error: Must provide extraction_id or use --schema to specify template file (unless using --save-html)",
        );
        process.exit(1);
      }

      if (!url) {
        console.error("Error: url is required");
        process.exit(1);
      }

      const scrolls = parseInt(options.scrolls, 10);
      const delay = parseInt(options.delay, 10);

      // Load schema from file or use extraction_id
      let extractionConfig: {
        extractionId?: number;
        schema?: any;
        strategy?: any;
        templateName?: string;
      };

      if (options.schema) {
        // --schema has priority
        const schemaPath = path.resolve(options.schema);
        if (!fs.existsSync(schemaPath)) {
          console.error(`Error: Template file does not exist: ${schemaPath}`);
          process.exit(1);
        }

        try {
          const schemaContent = fs.readFileSync(schemaPath, "utf-8");
          const schemaData = JSON.parse(schemaContent);

          if (!schemaData.schema) {
            console.error(`Error: Template file missing schema field: ${schemaPath}`);
            process.exit(1);
          }

          extractionConfig = {
            schema: schemaData.schema,
            strategy: schemaData.strategy || null,
            templateName: schemaData.name || path.basename(schemaPath),
          };
        } catch (error: any) {
          console.error(`Error: Failed to read template file - ${error.message}`);
          process.exit(1);
        }
      } else {
        // Use extraction_id
        const extractId =
          typeof extractionId === "number"
            ? extractionId
            : parseInt(extractionId, 10);
        extractionConfig = { extractionId: extractId };
      }

      // Handle --interval option
      if (options.interval) {
        const intervalSeconds = options.interval * 60;
        console.error(`Starting loop extraction (interval: ${options.interval} minutes)`);
        console.error("Press Ctrl+C to stop\n");

        let iteration = 0;

        const intervalFunc = async () => {
          // If using --random, reselect instance randomly on each iteration
          if (options.random) {
            selectedInstance = await selectInstance();
            apiEndpoint = selectedInstance.endpoint;
          }

          iteration++;
          const timestamp = new Date().toLocaleString("en-US", {
            hour12: false,
          });
          console.error("\n" + "=".repeat(60));
          console.error(`Extraction #${iteration} - ${timestamp}`);
          console.error("=".repeat(60) + "\n");

          const result = await commonExtract(
            url,
            scrolls,
            delay,
            apiEndpoint,
            { ...extractionConfig, instanceName: selectedInstance.instanceName },
          );
          console.log(JSON.stringify(result, null, 2));
          console.log();

          if (options.webhook && result.success) {
            await sendWebhook(options.webhook, result);
          }

          // Show waiting message after each extraction
          const nextTime = new Date(Date.now() + intervalSeconds * 1000);
          console.error(`\nWaiting ${options.interval} minutes until next extraction...`);
          console.error(
            `Next extraction time: ${nextTime.toLocaleString("en-US", { hour12: false })}`,
          );
        };

        await intervalFunc();

        const timer = setInterval(intervalFunc, intervalSeconds * 1000);

        process.on("SIGINT", () => {
          clearInterval(timer);
          console.error(`\n\nUser interrupted, executed ${iteration} extractions`);
          process.exit(0);
        });
      } else {
        const result = await commonExtract(
          url,
          scrolls,
          delay,
          apiEndpoint,
          { ...extractionConfig, instanceName: selectedInstance.instanceName },
        );
        console.log(JSON.stringify(result, null, 2));

        if (options.webhook && result.success) {
          await sendWebhook(options.webhook, result);
        }
      }
    });

  // ============================================================================
  // extraction command - Manage extraction templates
  // ============================================================================
  const extraction = program
    .command("extraction")
    .description("Manage extraction templates");

  extraction
    .command("list")
    .description("List all extraction templates")
    .action(() => {
      const extractions = listExtractionsFromFiles();

      if (extractions.length === 0) {
        console.log("No extraction templates found");
        console.log(`\nCreate templates in: ${getExtractionsDir()}`);
        return;
      }

      console.log(`\nTotal ${extractions.length} extraction templates:\n`);
      console.log(`${"ID".padEnd(6)} ${"Name".padEnd(40)} Description`);
      console.log("-".repeat(100));

      for (const ext of extractions) {
        const id = String(ext.id).padEnd(6);
        const name = ext.name.substring(0, 38).padEnd(40);
        const desc = ext.description.substring(0, 50);
        console.log(`${id} ${name} ${desc}`);
      }
      console.log();
    });

  extraction
    .command("show <id>")
    .description("Show extraction template details")
    .action((id: string) => {
      const extractionId = parseInt(id, 10);

      if (isNaN(extractionId)) {
        console.error(`Error: Invalid ID: ${id}`);
        process.exit(1);
      }

      const data = getExtractionById(extractionId);

      if (!data) {
        console.error(`Error: Extraction template ${extractionId} not found`);
        process.exit(1);
      }

      console.log(JSON.stringify(data, null, 2));
    });

  extraction
    .command("delete <ids>")
    .description("Delete extraction templates (comma-separated IDs)")
    .action((idsArg: string) => {
      const idStr = idsArg.trim();
      let ids: number[];

      try {
        if (idStr.includes(",")) {
          ids = idStr.split(",").map((x: string) => parseInt(x.trim(), 10));
        } else {
          ids = [parseInt(idStr, 10)];
        }
      } catch (e) {
        console.error(`Error: Invalid ID format: ${idStr}`);
        process.exit(1);
      }

      let successCount = 0;
      const failedIds: number[] = [];

      for (const extId of ids) {
        try {
          const deleted = deleteExtractionFile(extId);
          if (deleted) {
            console.log(`Deleted extraction template ID: ${extId}`);
            successCount++;
          } else {
            console.error(`Error: Extraction template ${extId} does not exist`);
            failedIds.push(extId);
          }
        } catch (error: any) {
          console.error(`Error deleting ${extId}: ${error.message}`);
          failedIds.push(extId);
        }
      }

      console.log(`\nDeletion complete: ${successCount} successful`);
      if (failedIds.length > 0) {
        console.error(`${failedIds.length} failed: ${failedIds.join(", ")}`);
        process.exit(1);
      }
    });

  // ============================================================================
  // extract-html command - Extract data from local HTML file
  // ============================================================================
  program
    .command("extract-html <html-file> <schema-json>")
    .description("Extract data from local HTML files (offline mode)")
    .option("--webhook <url>", "POST extraction result to webhook URL")
    .addHelpText(
      "after",
      `
Arguments:
  html-file             Local HTML file path
  schema-json           Extraction schema file (JSON format)

Description:
  Extracts structured data from local HTML files without browser.
  Uses the xtor library to parse HTML and extract data based on
  declarative schemas. Useful for testing schemas, batch processing,
  and offline data extraction.

  Logs are written to stderr, JSON output to stdout for clean piping.

Features:
  - No browser required (pure Node.js parsing)
  - Fast offline extraction
  - Schema validation and error reporting
  - Pipe-friendly output (stdout = data, stderr = logs)

Examples:
  # Extract data and print JSON
  $ pageflow extract-html page.html schema.json

  # Save results to file
  $ pageflow extract-html page.html schema.json > result.json

  # Extract specific fields with jq
  $ pageflow extract-html page.html schema.json | jq '.data[].title'

  # Silent mode (suppress logs)
  $ pageflow extract-html page.html schema.json 2>/dev/null

  # Complete workflow: save HTML then extract
  $ pageflow extract --save-html "https://example.com" page.html
  $ pageflow extract-html page.html schema.json

Schema File Format:
  Same as regular extraction templates:
  {
    "name": "Template Name",
    "schema": [...],           // xtor schema (required)
    "strategy": {              // optional
      "merge": "concat",
      "unique": "id"
    }
  }

Output Format:
  {
    "success": true,
    "data": [...],            // extracted results
    "source": "/path/to/file"
  }

Use Cases:
  - Test extraction schemas on saved HTML
  - Batch process multiple HTML files
  - Debug schema configurations
  - Extract data from archived pages
  - Offline data processing workflows

`,
    )
    .action(async (htmlFile: string, schemaJson: string, options: any) => {
      try {
        // 1. Read HTML file
        const htmlPath = path.resolve(htmlFile);
        if (!fs.existsSync(htmlPath)) {
          console.error(`Error: HTML file does not exist: ${htmlPath}`);
          process.exit(1);
        }

        const html = fs.readFileSync(htmlPath, "utf-8");
        console.error(`Read HTML file: ${htmlPath}`);
        console.error(`HTML size: ${html.length} characters`);

        // 2. Read schema file
        const schemaPath = path.resolve(schemaJson);
        if (!fs.existsSync(schemaPath)) {
          console.error(`Error: Schema file does not exist: ${schemaPath}`);
          process.exit(1);
        }

        let schemaData: any;
        try {
          const schemaContent = fs.readFileSync(schemaPath, "utf-8");
          schemaData = JSON.parse(schemaContent);
        } catch (error: any) {
          console.error(`Error: Failed to read schema file - ${error.message}`);
          process.exit(1);
        }

        if (!schemaData.schema) {
          console.error(`Error: Schema file missing schema field: ${schemaPath}`);
          process.exit(1);
        }

        console.error(`Read schema: ${schemaData.name || path.basename(schemaPath)}`);
        console.error("");

        // 3. Extract data using xtor
        console.error("Extracting data...");
        const extractor = new Extractor(
          schemaData.schema,
          schemaData.strategy || null,
        );
        const result = extractor.extract(html);

        const dataCount = Array.isArray(result) ? result.length : 1;
        console.error(`Extraction successful! Extracted ${dataCount} items`);
        console.error("");

        // 4. Output JSON to stdout
        const output = {
          success: true,
          data: result,
          source: htmlPath,
        };
        console.log(JSON.stringify(output, null, 2));

        // 5. Send to webhook if specified
        if (options.webhook) {
          await sendWebhook(options.webhook, output);
        }
      } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
    });

  program.parse();
}

main().catch((error) => {
  console.error("Unhandled error:", error.message);
  process.exit(1);
});
