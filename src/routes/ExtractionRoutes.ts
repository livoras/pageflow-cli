import { Request, Response, Application } from "express";
import { BaseRouteHandler } from "./BaseRouteHandler";
import { StateManager } from "../services/StateManager";
import { ExtractionService } from "../services/ExtractionService";
import { PageService } from "../services/PageService";

export class ExtractionRoutes extends BaseRouteHandler {
  private extractionService: ExtractionService;

  constructor(
    stateManager: StateManager,
    pageService: PageService,
  ) {
    super(stateManager);
    this.extractionService = new ExtractionService(
      stateManager,
      pageService,
    );
  }

  registerRoutes(app: Application): void {
    // POST /api/extract - Common extract: create page, scroll, extract
    app.post("/api/extract", async (req: Request, res: Response) => {
      try {
        const { url, scrolls = 0, delay = 0, extraction } = req.body;

        // Validate required fields
        if (!url || typeof url !== "string") {
          return res
            .status(400)
            .json({ error: "url is required and must be a string" });
        }

        if (typeof scrolls !== "number" || scrolls < 0) {
          return res
            .status(400)
            .json({ error: "scrolls must be a non-negative number" });
        }

        if (typeof delay !== "number" || delay < 0 || delay > 30000) {
          return res
            .status(400)
            .json({ error: "delay must be a number between 0 and 30000 (ms)" });
        }

        // Validate extraction parameter
        if (!extraction || typeof extraction !== "object") {
          return res
            .status(400)
            .json({ error: "extraction is required and must be an object" });
        }

        if (!extraction.schema || typeof extraction.schema !== "object") {
          return res.status(400).json({
            error: "extraction.schema is required and must be an object",
          });
        }

        const extractionConfig = {
          schema: extraction.schema,
          strategy: extraction.strategy,
        };

        this.logInfo("Starting common extract", {
          url,
          scrolls,
          delay,
        });

        const result = await this.extractionService.commonExtract(
          url,
          scrolls,
          delay,
          extractionConfig,
        );

        this.logInfo("Common extract completed", {
          url,
          dataLength: result.data.length,
        });

        res.json(result);
      } catch (error: any) {
        this.handleError(res, error, "Error executing common extract");
      }
    });
  }
}
