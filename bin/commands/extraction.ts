import { Command } from "commander";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { InstanceManager } from "../../src/utils/InstanceManager";
import { Extractor } from "xtor";
import { InstanceSelector } from "../utils/InstanceSelector";
import { getProcessEnv } from "../utils/process";


// ============================================================================
// Type Definitions
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
// Helper Functions
// ============================================================================

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

async function sendWebhook(url: string, data: any): Promise<void> {
  try {
    await axios.post(url, data, {
      timeout: 5000,
      headers: {
        "Content-Type": "application/json",
      },
    });
    console.error(`Webhook delivered: ${url}`);
  } catch (error: any) {
    console.error(`Webhook failed: ${error.message}`);
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

function getExtractionsDir(): string {
  return path.join(os.homedir(), ".pageflow", "extractions");
}

function listExtractionsFromFiles(): ExtractionTemplate[] {
  const extractionsDir = getExtractionsDir();

  if (!fs.existsSync(extractionsDir)) {
    return [];
  }

  const files = fs.readdirSync(extractionsDir)
    .filter(file => file.endsWith(".json"))
    .sort((a, b) => {
      const idA = parseInt(path.basename(a, ".json"), 10);
      const idB = parseInt(path.basename(b, ".json"), 10);
      return idA - idB;
    });

  const extractions: ExtractionTemplate[] = [];

  for (const file of files) {
    const filePath = path.join(extractionsDir, file);
    const id = parseInt(path.basename(file, ".json"), 10);

    if (isNaN(id)) continue;

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);

      extractions.push({
        id,
        name: data.name || "Untitled",
        description: data.description || "",
      });
    } catch (error) {
      console.error(`Warning: Failed to read ${file}: ${error instanceof Error ? error.message : "Unknown error"}`);
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
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read extraction ${id}: ${error instanceof Error ? error.message : "Unknown error"}`);
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
    throw new Error(`Failed to delete extraction ${id}: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export function registerExtractionCommands(program: Command): void {
    // Extract command (default)
    program
      .command("extract [url] [extraction_id]", { isDefault: true })
      .description("Extract structured data from web pages")
      .option("--scrolls <number>", "Number of page-down scrolls to perform", "0")
      .option("--delay <ms>", "Delay in milliseconds after each scroll", "0")
      .option("--use <name>", "Use specific named instance")
      .option("--random", "Randomly select a running instance")
      .option("--interval <mins>", "Start background extraction job (interval in minutes)", parseFloat)
      .option("--save-html", "Save page HTML (url required, extraction_id as optional file path)")
      .option("--schema <file>", "Use custom extraction template file (JSON)")
      .option("--webhook <url>", "POST extraction result to webhook URL")
      .option("--stop-job <number>", "Stop extraction job by number", parseInt)
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
  
  Background Extraction Jobs:
    --interval <mins>     Start background extraction job (runs on server)
                          Useful for monitoring dynamic content
    --stop-job <number>   Stop extraction job by number
  
  Examples:
    # Extract using template ID
    $ pageflow extract "https://example.com/products" 3
  
    # Extract with custom schema
    $ pageflow extract --schema ./my-schema.json "https://example.com"
  
    # Extract with 5 scrolls and 1 second delay
    $ pageflow extract "https://example.com" 3 --scrolls 5 --delay 1000
  
    # Use specific instance
    $ pageflow extract "https://example.com" 3 --use my-crawler
  
    # Start background extraction job (runs every 5 minutes)
    $ pageflow extract "https://example.com" 3 --interval 5
  
    # Stop extraction job #2
    $ pageflow extract --stop-job 2
  
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
  
        // Handle --stop-job option
        if (options.stopJob) {
          const jobNumber = options.stopJob;
  
          const instance = instanceManager.getDefaultInstance();
          if (!instance) {
            console.error("Error: No running instances");
            process.exit(1);
          }
  
          const apiEndpoint = instanceManager.getInstanceUrl(instance);
  
          try {
            const response = await axios.get(`${apiEndpoint}/api/jobs?type=extraction`, { timeout: 2000 });
            const jobs = response.data.jobs;
  
            if (!jobs || jobs.length === 0) {
              console.error(`Error: No extraction jobs found`);
              process.exit(1);
            }
  
            if (jobNumber < 1 || jobNumber > jobs.length) {
              console.error(`Error: Job number ${jobNumber} is out of range (1-${jobs.length})`);
              process.exit(1);
            }
  
            const job = jobs[jobNumber - 1];
            console.error(`Stopping extraction job #${jobNumber} (URL: ${job.config.url})...`);
  
            await axios.delete(`${apiEndpoint}/api/jobs/${job.id}`);
            console.error(`Extraction job stopped and deleted successfully`);
            return;
          } catch (error: any) {
            if (error.response) {
              console.error(`Error: HTTP ${error.response.status} - ${error.response.data?.error || error.message}`);
            } else {
              console.error(`Error: ${error.message}`);
            }
            process.exit(1);
          }
        }
  
        // Instance selection with fallback to remote server
        const selector = new InstanceSelector(instanceManager, "http://100.74.12.43:8006");
        const selectedInstance = await selector.select(options);
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
          // Use extraction_id - need to load template file
          const extractId =
            typeof extractionId === "number"
              ? extractionId
              : parseInt(extractionId, 10);
  
          const templatePath = path.join(
            os.homedir(),
            ".pageflow",
            "extractions",
            `${extractId}.json`,
          );
  
          if (!fs.existsSync(templatePath)) {
            console.error(`Error: Extraction template ${extractId} does not exist`);
            console.error(`Path: ${templatePath}`);
            process.exit(1);
          }
  
          try {
            const templateContent = fs.readFileSync(templatePath, "utf-8");
            const templateData = JSON.parse(templateContent);
  
            if (!templateData.schema) {
              console.error(`Error: Template ${extractId} missing schema field`);
              process.exit(1);
            }
  
            extractionConfig = {
              schema: templateData.schema,
              strategy: templateData.strategy || null,
              templateName: templateData.name || `Template ${extractId}`,
            };
          } catch (error: any) {
            console.error(`Error: Failed to load template ${extractId} - ${error.message}`);
            process.exit(1);
          }
        }
  
        // Handle --interval option (start background job)
        if (options.interval) {
          console.error(`Starting background extraction job (interval: ${options.interval} minutes)...`);
  
          try {
            const jobName = `extract-${new URL(url).hostname}-${Date.now()}`;
            const intervalSeconds = options.interval * 60;
  
            const createResponse = await axios.post(`${apiEndpoint}/api/jobs`, {
              type: "extraction",
              name: jobName,
              config: {
                url,
                scrolls,
                delay,
                extraction: extractionConfig,
                webhookUrl: options.webhook,
              },
              interval: intervalSeconds,
            });
  
            const job = createResponse.data;
            await axios.post(`${apiEndpoint}/api/jobs/${job.id}/start`);
  
            console.error(`Extraction job started successfully`);
            console.error(`- Job ID: ${job.id}`);
            console.error(`- Job Name: ${job.name}`);
            console.error(`- URL: ${url}`);
            console.error(`- Interval: ${options.interval} minutes`);
            console.error(`\nUse 'pageflow status' to view job status`);
            console.error(`Use 'pageflow extract --stop-job <number>' to stop the job`);
            return;
          } catch (error: any) {
            if (error.response) {
              console.error(`Error: HTTP ${error.response.status} - ${error.response.data?.error || error.message}`);
            } else {
              console.error(`Error: ${error.message}`);
            }
            process.exit(1);
          }
        }
  
        // Extract data
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
  
    // ============================================================================
    // jobs command - Manage background jobs
    // ============================================================================
    const jobs = program
}
