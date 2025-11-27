import express from "express";
import type { Request, Response } from "express";
import * as playwright from "playwright";
import type { Server } from "http";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { StateManager } from "./services/StateManager";
import { PageService } from "./services/PageService";
import { RouteRegistry } from "./utils/RouteRegistry";
import { HealthRoutes } from "./routes/HealthRoutes";
import { PageRoutes } from "./routes/PageRoutes";
import { ExtractionRoutes } from "./routes/ExtractionRoutes";
import { JobRoutes } from "./routes/JobRoutes";
import { LogRoutes } from "./routes/LogRoutes";
import { A11yRoutes } from "./routes/A11yRoutes";
import { ScriptRunnerRoutes } from "./routes/ScriptRunnerRoutes";
import { ServerService } from "./services/ServerService";
import { JobManager } from "./jobs/JobManager";

export class SimplePageServer {
  private app: express.Application;
  private httpServer: Server | null = null;
  private browser: playwright.Browser | null = null;
  private persistentContext: playwright.BrowserContext | null = null;
  private browserInitialized: boolean = false;
  private browserInitializing: Promise<void> | null = null;
  private userDataDir: string;
  private headless: boolean;
  private stateManager: StateManager;
  private routeRegistry: RouteRegistry;
  private serverServiceInstance: ServerService;
  private pageServiceInstance: PageService;
  private jobManager: JobManager;
  private instanceName: string;

  constructor(private port: number = parseInt(process.env.PORT || "3100")) {
    this.headless = process.env.HEADLESS === "true";
    this.userDataDir =
      process.env.USER_DATA_DIR ||
      path.join(os.homedir(), ".simple-page-server", "user-data");

    this.instanceName = process.env.INSTANCE_NAME || "default";

    this.app = express();
    this.app.use(express.json());

    // Initialize services
    this.stateManager = new StateManager();
    this.routeRegistry = new RouteRegistry();
    this.serverServiceInstance = new ServerService(this.stateManager);
    this.pageServiceInstance = new PageService(
      this.stateManager,
      this.serverServiceInstance,
    );
    this.jobManager = new JobManager(
      this.instanceName,
      this.stateManager,
      this.pageServiceInstance,
    );

    // Register route handlers
    this.routeRegistry.addHandler(
      new HealthRoutes(this.stateManager),
    );
    this.routeRegistry.addHandler(
      new PageRoutes(
        this.stateManager,
        this.pageServiceInstance,
      ),
    );
    this.routeRegistry.addHandler(
      new ExtractionRoutes(
        this.stateManager,
        this.pageServiceInstance,
      ),
    );
    this.routeRegistry.addHandler(
      new JobRoutes(
        this.stateManager,
        this.jobManager,
      ),
    );
    this.routeRegistry.addHandler(
      new LogRoutes(
        this.stateManager,
        this.instanceName,
      ),
    );
    this.routeRegistry.addHandler(
      new A11yRoutes(
        this.stateManager,
        this.pageServiceInstance,
      ),
    );
    this.routeRegistry.addHandler(
      new ScriptRunnerRoutes(
        this.stateManager,
        this.pageServiceInstance,
      ),
    );

    this.registerRoutes();
  }

  private registerRoutes() {
    this.routeRegistry.registerAllRoutes(this.app);
  }

  getJobManager(): JobManager {
    return this.jobManager;
  }

  async start() {
    // Initialize ServerService
    await this.serverServiceInstance.initialize();

    // Configure PageService with dependencies
    this.pageServiceInstance.setReinitContextCallback(async () => {
      await this.reinitBrowserContext();
      return this.persistentContext!;
    });
    this.pageServiceInstance.setEnsureBrowserCallback(async () => {
      await this.ensureBrowserInitialized();
    });

    // Initialize JobManager and restore saved jobs
    await this.jobManager.initialize();

    // Start HTTP server
    this.httpServer = this.app.listen(this.port, '0.0.0.0', () => {
      console.log(`SimplePageServer running on http://0.0.0.0:${this.port}`);
      console.log(`User data directory: ${this.userDataDir}`);
      console.log(`File-based storage enabled`);
    });
  }

  async stop() {
    // Close all pages
    const pages = this.stateManager.getPages();
    for (const [pageId] of pages) {
      await this.pageServiceInstance.closePage(pageId);
    }

    // Close browser
    if (this.persistentContext) {
      await this.persistentContext.close();
      this.persistentContext = null;
    }

    // Stop HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }
  }

  async reinitBrowserContext() {
    return this.initBrowser();
  }

  private async ensureBrowserInitialized(): Promise<void> {
    // If already initialized, return immediately
    if (this.browserInitialized && this.persistentContext) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.browserInitializing) {
      await this.browserInitializing;
      return;
    }

    // Start initialization
    this.browserInitializing = this.initBrowser()
      .then(() => {
        this.browserInitialized = true;
        this.browserInitializing = null;

        // Set browser context for PageService after initialization
        this.pageServiceInstance.setBrowserContext(this.persistentContext);
      })
      .catch((error) => {
        this.browserInitializing = null;
        throw new Error(`Failed to initialize browser: ${error.message}`);
      });

    await this.browserInitializing;
  }

  private async initBrowser() {
    const cdpEndpoint = process.env.CDP_ENDPOINT;

    if (cdpEndpoint) {
      // Remote CDP mode
      console.log(`Connecting to remote Chrome via CDP: ${cdpEndpoint}`);

      // Resolve HTTP endpoint to WebSocket URL if needed
      let wsEndpoint = cdpEndpoint;
      if (
        cdpEndpoint.startsWith("http://") ||
        cdpEndpoint.startsWith("https://")
      ) {
        const cdpUrl = new URL(cdpEndpoint);

        console.log(`Fetching CDP info from: ${cdpEndpoint}/json/version`);

        try {
          const response = await fetch(`${cdpEndpoint}/json/version`);
          console.log(`CDP response status: ${response.status}`);

          if (!response.ok) {
            console.log(
              `/json/version failed with status ${response.status}, trying /json endpoint`,
            );
            const jsonResponse = await fetch(`${cdpEndpoint}/json`);
            if (jsonResponse.ok) {
              const jsonText = await jsonResponse.text();
              const pages: any[] = JSON.parse(jsonText);
              if (pages.length > 0 && pages[0].webSocketDebuggerUrl) {
                wsEndpoint = pages[0].webSocketDebuggerUrl;
                wsEndpoint = wsEndpoint.replace(
                  /^ws:\/\/[^\/]+/,
                  `ws://${cdpUrl.host}`,
                );
                console.log(`Resolved from /json endpoint: ${wsEndpoint}`);
              }
            }
          } else {
            const responseText = await response.text();
            console.log(`CDP response body: ${responseText.substring(0, 500)}`);

            const data: any = JSON.parse(responseText);
            wsEndpoint = data.webSocketDebuggerUrl;

            const originalHost = cdpUrl.host;
            wsEndpoint = wsEndpoint.replace(
              /^ws:\/\/[^\/]+/,
              `ws://${originalHost}`,
            );
            console.log(`Resolved to WebSocket endpoint: ${wsEndpoint}`);
          }
        } catch (error) {
          console.error(`Failed to fetch CDP info:`, error);
          throw new Error(`Unable to connect to CDP endpoint: ${cdpEndpoint}`);
        }
      }

      this.browser = await playwright.chromium.connectOverCDP(wsEndpoint);
      console.log("✓ Connected to remote Chrome");

      // Get existing context or create new one
      if (this.browser.contexts().length > 0) {
        this.persistentContext = this.browser.contexts()[0];
        console.log("✓ Using existing browser context");
      } else {
        this.persistentContext = await this.browser.newContext();
        console.log("✓ Created new browser context");
      }

      // Inject anti-detection script for all pages
      await this.persistentContext.addInitScript(() => {
        // Remove webdriver flag
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });

        // Fix chrome object
        if (!(window as any).chrome) {
          (window as any).chrome = {
            runtime: {},
          };
        }

        // Fix plugins
        Object.defineProperty(navigator, "plugins", {
          get: () => [1, 2, 3, 4, 5],
        });

        // Fix languages
        Object.defineProperty(navigator, "languages", {
          get: () => ["zh-CN", "zh", "en"],
        });

        // Fix permissions query
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters: any) =>
          parameters.name === "notifications"
            ? Promise.resolve({
                state: Notification.permission,
              } as PermissionStatus)
            : originalQuery(parameters);
      });
      console.log("✓ Anti-detection script injected");

      console.log("Successfully connected to remote Chrome");
    } else {
      // Local mode - launch persistent context
      console.log("Starting local Chrome browser");

      // Create user data directory if it doesn't exist
      if (!fs.existsSync(this.userDataDir)) {
        fs.mkdirSync(this.userDataDir, { recursive: true });
      }

      // Use Google Chrome instead of Chromium
      const launchOptions: any = {
        headless: this.headless,
        args: [
            // Anti-automation detection
            "--disable-blink-features=AutomationControlled",
            "--exclude-switches=enable-automation",
            "--enable-automation=false",

            // Performance and resource management
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-gpu",
            "--disable-features=IsolateOrigins,site-per-process",
            "--window-size=1920,1080",
            "--start-maximized",

            // Disable notifications
            "--disable-notifications",
            "--disable-infobars",
            "--mute-audio",
            "--no-first-run",

            // Background process control
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",

            // Network and security
            "--enable-features=NetworkService,NetworkServiceInProcess",
            "--disable-web-security",
            "--allow-running-insecure-content",

            // Language settings
            "--lang=zh-CN",
            "--disable-features=UserAgentClientHint",

            // Load extension if specified
            ...(process.env.EXTENSION_PATH ? [
              `--load-extension=${process.env.EXTENSION_PATH}`,
              `--disable-extensions-except=${process.env.EXTENSION_PATH}`,
            ] : []),
          ],
      };

      this.persistentContext =
        await playwright.chromium.launchPersistentContext(
          this.userDataDir,
          launchOptions,
        );

      console.log("Local Chrome browser started");
    }
  }
}
