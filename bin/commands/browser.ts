import { Command } from "commander";
import axios from "axios";
import { InstanceManager } from "../../src/utils/InstanceManager";
import { InstanceSelector } from "../utils/InstanceSelector";

export function registerBrowserCommands(program: Command): void {
  program
    .command("open [url]")
    .description("Open a new browser tab")
    .option("--use <name>", "Use specific named instance")
    .option("--random", "Randomly select a running instance")
    .action(async (url, options) => {
      const instanceManager = new InstanceManager();
      const selector = new InstanceSelector(instanceManager);
      const { endpoint: apiEndpoint } = await selector.select(options);

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
}
