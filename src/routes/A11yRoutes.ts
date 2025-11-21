import { Request, Response, Application } from "express";
import { BaseRouteHandler } from "./BaseRouteHandler";
import { PageService } from "../services/PageService";
import { StateManager } from "../services/StateManager";
import { ResponseFormatter } from "../utils/ResponseFormatter";
import { RequestValidator } from "../utils/RequestValidator";
import { getAccessibilityTreeWithFrames } from "../utils";

export class A11yRoutes extends BaseRouteHandler {
  private pageService: PageService;

  constructor(
    stateManager: StateManager,
    pageService: PageService,
  ) {
    super(stateManager);
    this.pageService = pageService;
  }

  registerRoutes(app: Application): void {
    // Get accessibility tree from URL
    app.post("/api/a11y", async (req: Request, res: Response) => {
      try {
        const url = RequestValidator.requireString(req.body.url, "URL");
        const selector = req.body.selector as string | undefined;
        const timeout = req.body.timeout ?? 10000;

        console.log(`[A11y] Fetching accessibility tree for: ${url}`);
        if (selector) {
          console.log(`[A11y] Selector: ${selector}`);
        }

        // Create a temporary page
        const tempPageId = `temp-a11y-${Date.now()}`;
        const pageId = await this.pageService.createPage(
          tempPageId,
          `Temporary page for A11y tree: ${url}`,
          url,
          timeout,
          false, // Don't record actions
        );

        try {
          const pageInfo = this.stateManager.getPages().get(pageId)!;
          const simplePage = pageInfo.simplePage;

          // Get accessibility tree with frames
          const { combinedTree } = await getAccessibilityTreeWithFrames(
            false, // experimental
            simplePage,
            (log) => {
              if (log.level <= 1) {
                console.log(`[A11y] ${log.message}`);
              }
            },
            selector,
          );

          console.log(`[A11y] Tree generated, size: ${combinedTree.length} characters`);

          ResponseFormatter.success(res, { tree: combinedTree });
        } finally {
          // Always close the temporary page
          await this.pageService.closePage(pageId);
        }
      } catch (error: any) {
        this.handleError(res, error, "Error getting accessibility tree");
      }
    });
  }
}
