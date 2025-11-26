import * as fs from "fs";
import * as path from "path";
import { spawn, execSync } from "child_process";
import { InstanceManager } from "../../src/utils/InstanceManager";
import { isProcessRunning } from "./process";
import { checkServerHealth, checkCdpEndpoint } from "./helpers";
import { deletePidFile, deleteServerConfig, saveServerConfig } from "./config";

/**
 * Start a Pageflow server instance
 */
export async function startServer(options: {
  name?: string;
  port?: number;
  headless?: boolean;
  cdp?: string;
  extension?: string;
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

  // Add EXTENSION_PATH if --extension is provided
  if (options.extension) {
    updatedEnv.EXTENSION_PATH = options.extension;
  }

  // Kill the temporary process and spawn with correct env
  process.kill(child.pid!);

  // Create logs directory and log file
  const logsDir = path.join(userDataDir, '..', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const logFile = path.join(logsDir, `${timestamp}.log`);
  const latestLink = path.join(logsDir, 'latest.log');

  // Open log file for writing
  const logStream = fs.openSync(logFile, 'a');

  const finalChild = spawn(runtime, [serverScript], {
    detached: true,
    stdio: ['ignore', logStream, logStream],  // stdout and stderr to log file
    env: updatedEnv,
  });

  finalChild.unref();

  // Create/update latest.log symlink
  try {
    if (fs.existsSync(latestLink)) {
      fs.unlinkSync(latestLink);
    }
    fs.symlinkSync(path.basename(logFile), latestLink);
  } catch (e) {
    // Ignore symlink creation errors
  }

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

/**
 * Stop a single Pageflow instance
 */
export async function stopInstance(instanceName: string): Promise<boolean> {
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

/**
 * Restart a Pageflow instance
 */
export async function restartServer(options: { name?: string }): Promise<void> {
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

/**
 * Stop one or more Pageflow instances
 */
export async function stopServer(options: { names?: string[] }): Promise<void> {
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
