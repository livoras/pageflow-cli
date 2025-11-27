import { Command } from "commander";
import axios from "axios";
import { InstanceManager } from "../../src/utils/InstanceManager";
import { InstanceSelector } from "../utils/InstanceSelector";
import { registerRunServeCommand } from "./run-serve";

export function registerRunCommand(program: Command): void {
  const runCmd = program
    .command("run")
    .description("Execute scripts on webpages or start dispatch server");

  // Subcommand: run exec <url> <script>
  runCmd
    .command("exec <url> <script>")
    .description("Execute a script on a webpage")
    .option("--use <name>", "Use specific named instance")
    .option("--random", "Randomly select a running instance")
    .option("--timeout <ms>", "Script execution timeout in milliseconds", "60000")
    .addHelpText(
      "after",
      `
Arguments:
  url                   Target URL to navigate to
  script                JavaScript function to execute (receives 'page' parameter)

Description:
  Executes a custom JavaScript function on a webpage using Playwright.
  The script receives a Playwright Page object as parameter.

Options:
  --use <name>          Use specific instance (default: "default")
  --timeout <ms>        Script execution timeout (default: 60000)

Examples:
  # Get page title
  $ pageflow run exec "https://example.com" "async (page) => await page.title()"

  # Get all links
  $ pageflow run exec "https://example.com" "async (page) => await page.$$eval('a', els => els.map(e => e.href))"

  # Click a button and get result
  $ pageflow run exec "https://example.com" "async (page) => {
      await page.click('button');
      return await page.textContent('.result');
    }"

  # Use specific instance
  $ pageflow run exec --use tago "https://example.com" "async (page) => await page.title()"

  # Random instance selection
  $ pageflow run exec --random "https://example.com" "async (page) => await page.title()"

`,
    )
    .action(async (url, script, options) => {
      await runExec(url, script, options);
    });

  // Subcommand: run serve
  registerRunServeCommand(runCmd);

  // Default action: if first arg looks like URL, treat as exec
  runCmd
    .argument("[url]", "Target URL (shorthand for 'run exec')")
    .argument("[script]", "Script to execute")
    .option("--use <name>", "Use specific named instance")
    .option("--random", "Randomly select a running instance")
    .option("--timeout <ms>", "Script execution timeout in milliseconds", "60000")
    .action(async (url, script, options) => {
      if (url && script && !["exec", "serve"].includes(url)) {
        // Direct usage: pageflow run <url> <script>
        await runExec(url, script, options);
      } else if (!url) {
        runCmd.help();
      }
    });
}

async function runExec(url: string, script: string, options: any): Promise<void> {
  const instanceManager = new InstanceManager();

  // Instance selection
  const selector = new InstanceSelector(instanceManager);
  const selectedInstance = await selector.select(options);
  const apiEndpoint = selectedInstance.endpoint;

  const timeout = parseInt(options.timeout, 10);

  console.error(`Running script on: ${url}`);
  console.error(`Server: ${apiEndpoint}`);
  console.error("");

  try {
    const response = await axios.post(
      `${apiEndpoint}/api/run`,
      { url, script, timeout },
      {
        headers: { "Content-Type": "application/json" },
        timeout: timeout + 10000, // Add buffer for network
      },
    );

    if (response.data.success) {
      console.error("Script executed successfully");
      const result = {
        ...response.data,
        instance: selectedInstance.instanceName,
        endpoint: apiEndpoint,
        url,
      };
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(`Error: ${response.data.error}`);
      process.exit(1);
    }
  } catch (error: any) {
    if (error.response) {
      console.error(`Error: HTTP ${error.response.status} - ${error.response.data?.error || error.message}`);
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}
