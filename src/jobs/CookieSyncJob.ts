import { Job } from "./Job";
import { PageService } from "../services/PageService";

export class CookieSyncJob extends Job {
  private pageService: PageService;

  constructor(data: any, pageService: PageService) {
    super(data);
    this.type = "cookie-sync";
    this.pageService = pageService;
  }

  get typedConfig(): {
    targetUrl: string;
    domain: string;
  } {
    return this.config as {
      targetUrl: string;
      domain: string;
    };
  }

  async execute(): Promise<void> {
    const axios = (await import("axios")).default;
    const { targetUrl, domain } = this.typedConfig;

    try {
      const context = await this.pageService.getContext();
      let cookies = await context.cookies();

      if (domain !== "all") {
        cookies = cookies.filter(
          (c) =>
            c.domain.includes(domain) ||
            domain.includes(c.domain.replace(/^\./, "")),
        );
      }

      if (cookies.length > 0) {
        await axios.post(
          `${targetUrl}/api/cookies`,
          { cookies },
          { timeout: 10000 },
        );
        console.log(
          `[CookieSyncJob] Synced ${cookies.length} cookies to ${targetUrl} (domain: ${domain})`,
        );
      }

      this.lastRunAt = new Date();
      this.runCount++;
      await this.save();
    } catch (error: any) {
      console.error(
        `[CookieSyncJob] Error syncing cookies to ${targetUrl}:`,
        error.message,
      );
    }
  }
}
