import axios from "axios";

/**
 * Format a date to a human-readable "time ago" string
 */
export function formatTimeAgo(date: Date): string {
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
 * Check if a server is healthy by polling the /api/health endpoint
 */
export async function checkServerHealth(
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

/**
 * Check if a CDP (Chrome DevTools Protocol) endpoint is accessible
 */
export async function checkCdpEndpoint(cdpUrl: string): Promise<boolean> {
  try {
    const response = await axios.get(`${cdpUrl}/json/version`, {
      timeout: 5000,
    });
    return response.status === 200;
  } catch (error: any) {
    return false;
  }
}
