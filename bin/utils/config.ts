import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Get the Pageflow configuration directory path
 */
export function getConfigDir(): string {
  return path.join(os.homedir(), ".pageflow");
}

/**
 * Get the PID file path for the default server
 */
export function getPidFilePath(): string {
  return path.join(getConfigDir(), "server.pid");
}

/**
 * Get the configuration file path for the default server
 */
export function getConfigFilePath(): string {
  return path.join(getConfigDir(), "server.json");
}

/**
 * Ensure the configuration directory exists
 */
export function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

/**
 * Save the PID of the default server process
 */
export function savePid(pid: number): void {
  ensureConfigDir();
  fs.writeFileSync(getPidFilePath(), String(pid), "utf-8");
}

/**
 * Read the PID of the default server process
 */
export function readPid(): number | null {
  const pidFile = getPidFilePath();
  if (!fs.existsSync(pidFile)) {
    return null;
  }
  const pidStr = fs.readFileSync(pidFile, "utf-8").trim();
  const pid = parseInt(pidStr, 10);
  return isNaN(pid) ? null : pid;
}

/**
 * Delete the PID file
 */
export function deletePidFile(): void {
  const pidFile = getPidFilePath();
  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
}

/**
 * Save the server configuration (port and URL)
 */
export function saveServerConfig(port: number): void {
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

/**
 * Read the server configuration
 */
export function readServerConfig(): { port: number; url: string } | null {
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

/**
 * Delete the server configuration file
 */
export function deleteServerConfig(): void {
  const configFile = getConfigFilePath();
  if (fs.existsSync(configFile)) {
    fs.unlinkSync(configFile);
  }
}
