import { Job } from "./Job";
import { StateManager } from "../services/StateManager";
import { PageService } from "../services/PageService";
import { ExtractionService } from "../services/ExtractionService";

export class ExtractionJob extends Job {
  private stateManager: StateManager;
  private pageService: PageService;

  constructor(
    data: any,
    stateManager: StateManager,
    pageService: PageService,
  ) {
    super(data);
    this.type = "extraction";
    this.stateManager = stateManager;
    this.pageService = pageService;
  }

  get typedConfig(): {
    url: string;
    extraction: { schema: object; strategy?: object };
    scrolls: number;
    delay: number;
    webhookUrl?: string;
  } {
    return this.config as {
      url: string;
      extraction: { schema: object; strategy?: object };
      scrolls: number;
      delay: number;
      webhookUrl?: string;
    };
  }

  async execute(): Promise<void> {
    const axios = (await import("axios")).default;
    const { url, extraction, scrolls, delay, webhookUrl } = this.typedConfig;

    try {
      console.log(`[ExtractionJob] Running job ${this.id} for ${url}`);

      const extractionService = new ExtractionService(
        this.stateManager,
        this.pageService,
      );
      const result = await extractionService.commonExtract(
        url,
        scrolls,
        delay,
        extraction,
      );

      console.log(
        `[ExtractionJob] Job ${this.id} completed, extracted ${result.data.length} items`,
      );

      if (webhookUrl && result.success) {
        try {
          await axios.post(webhookUrl, result, {
            timeout: 5000,
            headers: { "Content-Type": "application/json" },
          });
          console.log(`[ExtractionJob] Webhook delivered to ${webhookUrl}`);
        } catch (error: any) {
          console.error(
            `[ExtractionJob] Webhook failed: ${error.message}`,
          );
        }
      }

      this.lastRunAt = new Date();
      this.runCount++;
      await this.save();
    } catch (error: any) {
      console.error(
        `[ExtractionJob] Error in job ${this.id}:`,
        error.message,
      );
    }
  }
}
