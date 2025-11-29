import { Command } from "commander";
import axios from "axios";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { chromium, BrowserContext } from "playwright";
import { InstanceManager, RemoteInstanceConfig } from "../../src/utils/InstanceManager";

export function registerShadowCommand(program: Command): void {
  program
    .command("shadow <name>")
    .description("Open a local shadow browser that syncs cookies to a remote instance")
    .option("--interval <seconds>", "Cookie sync interval in seconds", "15")
    .option("--domain <domain>", "Domain to filter cookies (default: all)", "all")
    .addHelpText(
      "after",
      `
Arguments:
  name                  Name of an existing remote instance to sync cookies to

Options:
  --interval <seconds>  Cookie sync interval in seconds (default: 15)
  --domain <domain>     Domain to filter cookies (default: all)

Description:
  Opens a local browser window that acts as a "shadow" for a remote instance.
  When you log into websites in the shadow browser, cookies are automatically
  synced to the remote instance at regular intervals.

  The shadow browser uses a dedicated user data directory:
  ~/.pageflow/shadow-<name>/user-data

Examples:
  # Open shadow browser for tencent instance
  $ pageflow shadow tencent

  # Sync cookies every 30 seconds
  $ pageflow shadow tencent --interval 30

  # Only sync cookies for xiaohongshu.com
  $ pageflow shadow tencent --domain xiaohongshu.com

`,
    )
    .action(async (name, options) => {
      const instanceManager = new InstanceManager();
      const interval = parseInt(options.interval, 10);
      const domain = options.domain;

      // Validate target instance exists and is remote
      const instance = instanceManager.getInstance(name);
      if (!instance) {
        console.error(`Error: Instance "${name}" does not exist`);
        console.error(`Use 'pageflow add-server <url> --name ${name}' to add it first`);
        process.exit(1);
      }

      if (instance.type !== "remote") {
        console.error(`Error: Instance "${name}" is not a remote instance`);
        console.error(`Shadow mode only works with remote instances`);
        process.exit(1);
      }

      const remoteInstance = instance as RemoteInstanceConfig;
      const targetUrl = remoteInstance.url;

      // Check remote instance health
      try {
        await axios.get(`${targetUrl}/api/health`, { timeout: 5000 });
      } catch (error: any) {
        console.error(`Error: Cannot connect to remote instance "${name}"`);
        console.error(`URL: ${targetUrl}`);
        console.error(`Reason: ${error.message}`);
        process.exit(1);
      }

      // Setup user data directory
      const baseDir = path.join(os.homedir(), ".pageflow");
      const userDataDir = path.join(baseDir, `shadow-${name}`, "user-data");

      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }

      console.error(`Starting shadow browser for "${name}"`);
      console.error(`- Target: ${targetUrl}`);
      console.error(`- User data: ${userDataDir}`);
      console.error(`- Sync interval: ${interval}s`);
      console.error(`- Domain filter: ${domain}`);
      console.error(``);

      // Launch browser
      let context: BrowserContext;
      try {
        context = await chromium.launchPersistentContext(userDataDir, {
          headless: false,
          args: [
            "--disable-blink-features=AutomationControlled",
            "--no-first-run",
            "--no-default-browser-check",
          ],
        });
      } catch (error: any) {
        console.error(`Error: Failed to launch browser: ${error.message}`);
        process.exit(1);
      }

      console.error(`Browser started. Log into websites to sync cookies.`);
      console.error(`Press Ctrl+C to stop and perform final sync.`);
      console.error(``);

      // Cookie sync function
      const syncCookies = async (): Promise<number> => {
        try {
          let cookies = await context.cookies();

          if (domain !== "all") {
            cookies = cookies.filter(
              (c) =>
                c.domain.includes(domain) ||
                domain.includes(c.domain.replace(/^\./, "")),
            );
          }

          if (cookies.length === 0) {
            return 0;
          }

          await axios.post(
            `${targetUrl}/api/cookies`,
            { cookies },
            { timeout: 10000 },
          );

          return cookies.length;
        } catch (error: any) {
          const detail = error.response?.data?.error || error.message;
          console.error(`[Sync Error] ${detail}`);
          return -1;
        }
      };

      // Track sync stats
      let syncCount = 0;
      let lastCookieCount = 0;

      // Start periodic sync
      const syncTimer = setInterval(async () => {
        const count = await syncCookies();
        if (count > 0) {
          syncCount++;
          if (count !== lastCookieCount) {
            console.error(`[Sync #${syncCount}] Synced ${count} cookies to ${name}`);
            lastCookieCount = count;
          }
        }
      }, interval * 1000);

      // Handle graceful shutdown
      let isShuttingDown = false;

      const shutdown = async () => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.error(``);
        console.error(`Shutting down...`);

        // Stop sync timer
        clearInterval(syncTimer);

        // Final sync
        console.error(`Performing final cookie sync...`);
        const finalCount = await syncCookies();
        if (finalCount > 0) {
          console.error(`Final sync: ${finalCount} cookies`);
        } else if (finalCount === 0) {
          console.error(`No cookies to sync`);
        }

        // Close browser
        try {
          await context.close();
        } catch {
          // Ignore close errors
        }

        console.error(`Shadow browser closed.`);
        process.exit(0);
      };

      // Listen for termination signals
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      // Also handle browser close event
      context.on("close", () => {
        if (!isShuttingDown) {
          shutdown();
        }
      });

      // Keep process alive
      await new Promise(() => {});
    });
}
