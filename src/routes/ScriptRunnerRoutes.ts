import { Request, Response, Application } from "express";
import { BaseRouteHandler } from "./BaseRouteHandler";
import { PageService } from "../services/PageService";
import { StateManager } from "../services/StateManager";
import { ResponseFormatter } from "../utils/ResponseFormatter";
import { RequestValidator } from "../utils/RequestValidator";

export class ScriptRunnerRoutes extends BaseRouteHandler {
  private pageService: PageService;

  constructor(stateManager: StateManager, pageService: PageService) {
    super(stateManager);
    this.pageService = pageService;
  }

  registerRoutes(app: Application): void {
    app.post("/api/run", async (req: Request, res: Response) => {
      let pageId: string | null = null;

      try {
        const script = RequestValidator.requireString(req.body.script, "script");
        const url = req.body.url as string | undefined;
        const timeout = req.body.timeout ?? 60000;

        const requestId = `run-${Date.now()}`;
        this.logInfo(`[${requestId}] Script execution request`, {
          hasUrl: !!url,
          scriptLength: script.length,
        });

        // Create temporary page
        pageId = await this.pageService.createPage(
          `temp-run-${Date.now()}`,
          `Script execution: ${url || "no url"}`,
          url || "about:blank",
          timeout,
          false,
        );

        const pageInfo = this.stateManager.getPages().get(pageId)!;
        const page = pageInfo.page;

        // Wait for page to be ready if URL provided
        if (url) {
          await page.waitForTimeout(1000);
        }

        this.logInfo(`[${requestId}] Executing script`);

        // Execute script with page as parameter
        const scriptFn = new Function("page", `return (${script})(page);`);
        const result = await scriptFn(page);

        this.logInfo(`[${requestId}] Script execution completed`);
        ResponseFormatter.success(res, { data: result });
      } catch (error: any) {
        this.handleError(res, error, "Script execution failed");
      } finally {
        if (pageId) {
          await this.pageService.closePage(pageId);
        }
      }
    });
  }
}
