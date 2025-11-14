import { execSync } from "child_process";

/**
 * Check if a process is running by PID
 */
export async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get environment variables of a process
 */
export function getProcessEnv(pid: number): Record<string, string> {
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
