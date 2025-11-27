import { Command } from "commander";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { InstanceManager } from "../../src/utils/InstanceManager";
import { InstanceSelector } from "../utils/InstanceSelector";

interface A11yResponse {
  success: boolean;
  tree?: string;
  error?: string;
}

async function getA11yTree(
  url: string,
  apiEndpoint: string,
  selector?: string,
): Promise<string> {
  console.error("Fetching accessibility tree...");
  console.error(`- URL: ${url}`);
  console.error(`- Server: ${apiEndpoint}`);
  if (selector) {
    console.error(`- Selector: ${selector}`);
  }

  const payload: any = { url };
  if (selector) {
    payload.selector = selector;
  }

  const response = await axios.post<A11yResponse>(
    `${apiEndpoint}/api/a11y`,
    payload,
    {
      headers: { "Content-Type": "application/json" },
      timeout: 60000,
    },
  );

  if (response.data.success && response.data.tree) {
    console.error(`Fetch successful! Tree size: ${response.data.tree.length} characters`);
    return response.data.tree;
  } else {
    const errorMsg = response.data.error || "Unknown error";
    console.error(`Fetch failed: ${errorMsg}`);
    process.exit(1);
  }
}

function generateDefaultOutputPath(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "-")
    .slice(0, 19);
  return `/tmp/a11y-${timestamp}.txt`;
}

export function registerA11yCommand(program: Command): void {
  program
    .command("a11y <url>")
    .description("Get accessibility tree from a web page")
    .option("-o, --output <file>", "Output file path")
    .option("--use <instance>", "Use specific pageflow instance")
    .option("--selector <xpath>", "Extract only specific XPath subtree")
    .action(async (url: string, options: any) => {
      try {
        const instanceManager = new InstanceManager();
        const selector = new InstanceSelector(instanceManager);

        const { endpoint, instanceName } = await selector.select({
          use: options.use,
          random: options.random,
        });

        const tree = await getA11yTree(url, endpoint, options.selector);

        const outputPath = options.output || generateDefaultOutputPath();
        fs.writeFileSync(outputPath, tree, "utf-8");

        console.error("");
        console.error(`Accessibility tree saved to: ${outputPath}`);
      } catch (error: any) {
        if (error.code === "ECONNREFUSED") {
          console.error(
            "Error: Cannot connect to pageflow server. Make sure it's running.",
          );
        } else {
          const serverError = error.response?.data?.error;
          console.error(`Error: ${serverError || error.message}`);
        }
        process.exit(1);
      }
    });
}
