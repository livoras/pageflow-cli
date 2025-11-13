import { PageInfo } from "../types/PageInfo";
import { StateManager } from "./StateManager";
import { ServerService } from "./ServerService";
import { SimplePage } from "../SimplePage";
import { BrowserContext } from "playwright";
import { v4 as uuid } from "uuid";

export class PageService {
  private stateManager: StateManager;
  private serverService: ServerService;
  private persistentContext: BrowserContext | null = null;
  private pages: Map<string, PageInfo> = new Map();
  private broadcastCallback?: (eventType: string, data: any) => void;
  private reinitContextCallback?: () => Promise<BrowserContext>;
  private ensureBrowserCallback?: () => Promise<void>;
  private managementPageId: string | null = null;

  constructor(
    stateManager: StateManager,
    serverService: ServerService,
    persistentContext: BrowserContext | null = null,
  ) {
    this.stateManager = stateManager;
    this.serverService = serverService;
    this.persistentContext = persistentContext;
  }

  setBrowserContext(context: BrowserContext) {
    this.persistentContext = context;
  }

  setReinitContextCallback(callback: () => Promise<BrowserContext>) {
    this.reinitContextCallback = callback;
  }

  setEnsureBrowserCallback(callback: () => Promise<void>) {
    this.ensureBrowserCallback = callback;
  }

  setPagesMap(pages: Map<string, PageInfo>) {
    this.pages = pages;
  }

  setBroadcastCallback(callback: (eventType: string, data: any) => void) {
    this.broadcastCallback = callback;
  }

  /**
   * Ensure management page exists for cookie/context operations
   * Creates a hidden page that stays open for management tasks
   */
  private async ensureManagementPage(): Promise<void> {
    // Check if management page still exists and is valid
    if (this.managementPageId) {
      const pageInfo = this.pages.get(this.managementPageId);
      if (pageInfo && !pageInfo.page.isClosed()) {
        return; // Management page is still valid
      }
    }

    // Create new management page
    console.log("[PageService] Creating management page for cookie operations");
    this.managementPageId = await this.createPage(
      "__management__",
      "Internal management page for cookie/context operations",
      "about:blank",
      5000,
      false,
    );
  }

  /**
   * Get browser context for cookie/management operations
   * Automatically ensures management page exists
   */
  async getContext(): Promise<BrowserContext> {
    // Ensure browser is initialized
    if (this.ensureBrowserCallback) {
      await this.ensureBrowserCallback();
    }

    if (!this.persistentContext) {
      throw new Error("Browser not initialized");
    }

    // Ensure management page exists
    await this.ensureManagementPage();

    return this.persistentContext;
  }

  async createPage(
    name: string,
    description: string | undefined,
    url: string,
    timeout: number = 10000,
    recordActions: boolean = false,
  ): Promise<string> {
    // Ensure browser is initialized before creating page
    if (this.ensureBrowserCallback) {
      await this.ensureBrowserCallback();
    }

    if (!this.persistentContext) {
      throw new Error("Browser not initialized");
    }

    const id = uuid();
    let page;

    try {
      page = await this.persistentContext.newPage();
    } catch (error: any) {
      // If context is closed, try to reinitialize it
      if (
        error.message?.includes(
          "Target page, context or browser has been closed",
        )
      ) {
        console.log("[PageService] Browser context closed, reinitializing...");
        if (this.reinitContextCallback) {
          this.persistentContext = await this.reinitContextCallback();
          page = await this.persistentContext.newPage();
          console.log(
            "[PageService] Successfully reinitialized context and created page",
          );
        } else {
          throw new Error(
            "Browser context closed and no reinit callback available",
          );
        }
      } else {
        throw error;
      }
    }
    const enableScreenshot = process.env.SCREENSHOT !== "false";
    const simplePage = new SimplePage(page, enableScreenshot);

    await simplePage.init();

    await simplePage.navigate(url, timeout, `Initial navigation to ${url}`);

    const pageInfo: PageInfo = {
      id,
      name,
      description,
      page,
      simplePage,
      createdAt: new Date(),
    };

    this.pages.set(id, pageInfo);
    this.stateManager.setPage(id, pageInfo);

    return id;
  }

  async closePage(pageId: string): Promise<void> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error("Page not found");
    }

    await pageInfo.page.close();
    this.pages.delete(pageId);
    this.stateManager.deletePage(pageId);
  }

}
