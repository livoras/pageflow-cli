import { StateManager } from "./StateManager";
import { PageService } from "./PageService";
import { Extractor } from "xtor";
import type { XRaySchema, LoopStrategy } from "xtor";

export class ExtractionService {
  private stateManager: StateManager;
  private pageService: PageService;

  constructor(
    stateManager: StateManager,
    pageService: PageService,
  ) {
    this.stateManager = stateManager;
    this.pageService = pageService;
  }

  /**
   * Common extract: Create temporary page, scroll, and extract data
   * Uses accumulator pattern like replay loop extraction
   */
  async commonExtract(
    url: string,
    scrolls: number,
    delay: number,
    extraction: {
      schema: XRaySchema;
      strategy?: LoopStrategy;
    },
  ) {
    let pageId: string | null = null;

    try {
      // 1. Create temporary page (without recording)
      pageId = await this.pageService.createPage(
        "CommonExtract",
        undefined,
        url,
        10000,
        false, // recordActions = false
      );

      const pageInfo = this.stateManager.getPage(pageId);
      if (!pageInfo) {
        throw new Error("Failed to get page info after creation");
      }

      // 2. Create accumulator for loop extraction
      const extractor = new Extractor(extraction.schema, extraction.strategy);
      const accumulator = extractor.loop();

      // 3. Extract initial HTML (before scrolling)
      let html = await pageInfo.page.content();
      const escapedUrl = url.replace(/"/g, "&quot;");
      html = this.injectUrlToHtml(html, escapedUrl);
      const initialResult = accumulator.extract(html);
      console.log(
        `[CommonExtract] Initial extraction: ${Array.isArray(initialResult) ? initialResult.length : "N/A"} items`,
      );

      // 4. Execute pageDown scrolls and extract after each scroll
      for (let i = 0; i < scrolls; i++) {
        const scrollStart = Date.now();
        await pageInfo.simplePage.actByXPath("//body", "pageDown", []);
        // Each pageDown automatically calls _waitForSettledDom()
        const afterScroll = Date.now();

        // Additional delay if specified
        if (delay > 0) {
          console.log(
            `[CommonExtract] Waiting ${delay}ms before extraction...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        const afterDelay = Date.now();

        // Extract HTML after this scroll
        html = await pageInfo.page.content();
        html = this.injectUrlToHtml(html, escapedUrl);
        const iterResult = accumulator.extract(html);
        console.log(
          `[CommonExtract] Scroll ${i + 1}/${scrolls}: ${Array.isArray(iterResult) ? iterResult.length : "N/A"} items extracted (scroll: ${afterScroll - scrollStart}ms, delay: ${afterDelay - afterScroll}ms)`,
        );
      }

      // 5. Get final accumulated result
      const result = accumulator.getResult();
      console.log(
        `[CommonExtract] Final result: ${Array.isArray(result) ? result.length : "N/A"} items`,
      );

      // 6. Extract first item for object schema without scrolls
      const isArraySchema = Array.isArray(extraction.schema);
      const finalData = (scrolls === 0 && !isArraySchema && Array.isArray(result))
        ? result[0]
        : result;

      // 7. Return result
      return {
        success: true,
        data: finalData,
        extractedFrom: url,
      };
    } finally {
      // 7. Cleanup: close page
      if (pageId) {
        await this.pageService.closePage(pageId);
      }
    }
  }

  /**
   * Helper: Inject URL into HTML as meta tag
   */
  private injectUrlToHtml(html: string, escapedUrl: string): string {
    if (html.includes("<head>")) {
      return html.replace(
        "<head>",
        `<head><meta name="x-page-url" content="${escapedUrl}">`,
      );
    } else if (html.includes("<html>")) {
      return html.replace(
        "<html>",
        `<html><meta name="x-page-url" content="${escapedUrl}">`,
      );
    } else if (html.includes("<body>")) {
      return html.replace(
        "<body>",
        `<body><meta name="x-page-url" content="${escapedUrl}">`,
      );
    } else {
      // Prepend to the HTML
      return `<meta name="x-page-url" content="${escapedUrl}">${html}`;
    }
  }
}
