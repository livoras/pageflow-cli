import { Request, Response, Application } from "express";
import { BaseRouteHandler } from "./BaseRouteHandler";
import { PageService } from "../services/PageService";
import { StateManager } from "../services/StateManager";
import { ResponseFormatter } from "../utils/ResponseFormatter";
import { RequestValidator } from "../utils/RequestValidator";

export class PageRoutes extends BaseRouteHandler {
  private pageService: PageService;

  constructor(
    stateManager: StateManager,
    pageService: PageService,
  ) {
    super(stateManager);
    this.pageService = pageService;
  }

  registerRoutes(app: Application): void {
    // Create new page
    app.post("/api/pages", async (req: Request, res: Response) => {
      try {
        const name = RequestValidator.requireString(req.body.name, "Page name");
        const url = RequestValidator.requireString(req.body.url, "URL");
        const description = req.body.description as string | undefined;
        const timeout = req.body.timeout ?? 10000;
        const recordActions = req.body.recordActions ?? true;

        if (description) {
          console.log(`[CreatePage] ${description}`);
        }

        const pageId = await this.pageService.createPage(
          name,
          description,
          url,
          timeout,
          recordActions,
        );
        const pageInfo = this.stateManager.getPages().get(pageId)!;

        res.json({
          id: pageInfo.id,
          name: pageInfo.name,
          description: pageInfo.description,
          url: pageInfo.page.url(),
          createdAt: pageInfo.createdAt,
        });
      } catch (error: any) {
        this.handleError(res, error, "Error creating page");
      }
    });

    // Get HTML from URL (without creating a page)
    app.post("/api/html", async (req: Request, res: Response) => {
      try {
        const url = RequestValidator.requireString(req.body.url, "URL");
        const timeout = req.body.timeout ?? 10000;

        // Create a temporary page
        const tempPageId = `temp-${Date.now()}`;
        const pageId = await this.pageService.createPage(
          tempPageId,
          `Temporary page for HTML fetch: ${url}`,
          url,
          timeout,
          false, // Don't record actions
        );

        try {
          const pageInfo = this.stateManager.getPages().get(pageId)!;
          const html = await pageInfo.page.content();

          ResponseFormatter.success(res, { html });
        } finally {
          // Always close the temporary page
          await this.pageService.closePage(pageId);
        }
      } catch (error: any) {
        this.handleError(res, error, "Error getting HTML from URL");
      }
    });

    // Get cookies
    app.get("/api/cookies", async (req: Request, res: Response) => {
      try {
        const domain = req.query.domain as string | undefined;

        // Use persistent management page instead of creating temporary page
        const context = await this.pageService.getContext();
        const allCookies = await context.cookies();

        let cookies = allCookies;
        if (domain && domain !== "all") {
          cookies = allCookies.filter(c =>
            c.domain.includes(domain) || domain.includes(c.domain.replace(/^\./, ''))
          );
        }

        ResponseFormatter.success(res, { cookies });
      } catch (error: any) {
        this.handleError(res, error, "Error getting cookies");
      }
    });

    // Add cookies
    app.post("/api/cookies", async (req: Request, res: Response) => {
      try {
        const cookies = req.body.cookies;
        if (!Array.isArray(cookies)) {
          throw new Error("cookies must be an array");
        }

        // Use persistent management page instead of creating temporary page
        const context = await this.pageService.getContext();
        await context.addCookies(cookies);

        ResponseFormatter.success(res, {
          message: `Successfully added ${cookies.length} cookies`
        });
      } catch (error: any) {
        this.handleError(res, error, "Error adding cookies");
      }
    });

    // Push cookies to another server
    app.post("/api/cookies/push", async (req: Request, res: Response) => {
      try {
        const targetUrl = RequestValidator.requireString(req.body.targetUrl, "targetUrl");
        const domain = req.body.domain || "all";

        // Import axios dynamically
        const axios = (await import("axios")).default;

        // Get cookies from current server
        const context = await this.pageService.getContext();
        const allCookies = await context.cookies();

        let cookies = allCookies;
        if (domain && domain !== "all") {
          cookies = allCookies.filter(c =>
            c.domain.includes(domain) || domain.includes(c.domain.replace(/^\./, ''))
          );
        }

        if (cookies.length === 0) {
          ResponseFormatter.success(res, {
            message: "No cookies to push",
            count: 0,
          });
          return;
        }

        // Push cookies to target server
        await axios.post(`${targetUrl}/api/cookies`, {
          cookies,
        }, {
          timeout: 10000,
        });

        ResponseFormatter.success(res, {
          message: `Successfully pushed ${cookies.length} cookies to ${targetUrl}`,
          count: cookies.length,
          targetUrl,
          domain,
        });
      } catch (error: any) {
        this.handleError(res, error, "Error pushing cookies");
      }
    });
  }
}
