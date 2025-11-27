#!/usr/bin/env node
/**
 * Pageflow CLI - Browser automation and web data extraction tool
 */

import { Command } from "commander";
import axios from "axios";
import { InstanceManager } from "../src/utils/InstanceManager";
import packageJson from "../package.json";
import {
  startServer,
  restartServer,
  stopServer,
} from "./utils/instance";
import { showStatus } from "./commands/status";
import { registerBrowserCommands } from "./commands/browser";
import { registerCookiesCommands } from "./commands/cookies";
import { registerExtractionCommands } from "./commands/extraction";
import { registerJobsCommands } from "./commands/jobs";
import { registerLogsCommands } from "./commands/logs";
import { registerA11yCommand } from "./commands/a11y";
import { registerRunCommand } from "./commands/run";
import { registerShadowCommand } from "./commands/shadow";

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
    .option("--extension <path>", "Load unpacked Chrome extension from directory")
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
      const extension = options.extension;
      await startServer({ name, port, headless, cdp, extension });
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

  // Logs commands (log)
  registerLogsCommands(program);

  // A11y command (accessibility tree)
  registerA11yCommand(program);

  // Run command (script execution)
  registerRunCommand(program);

  // Shadow command (cookie sync browser)
  registerShadowCommand(program);

  program.parse();
}

main().catch((error) => {
  console.error("Unhandled error:", error.message);
  process.exit(1);
});
