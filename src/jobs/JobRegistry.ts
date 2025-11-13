import { Job } from "./Job";
import { CookieSyncJob } from "./CookieSyncJob";
import { ExtractionJob } from "./ExtractionJob";
import { StateManager } from "../services/StateManager";
import { PageService } from "../services/PageService";

type JobConstructor = new (
  data: any,
  ...args: any[]
) => Job;

export class JobRegistry {
  private static types = new Map<string, { constructor: JobConstructor; deps: string[] }>();

  static register(
    type: string,
    constructor: JobConstructor,
    deps: string[] = [],
  ): void {
    this.types.set(type, { constructor, deps });
  }

  static create(
    type: string,
    data: any,
    dependencies: {
      stateManager?: StateManager;
      pageService?: PageService;
    },
  ): Job {
    const entry = this.types.get(type);
    if (!entry) {
      throw new Error(`Unknown job type: ${type}`);
    }

    const { constructor, deps } = entry;
    const args: any[] = [data];

    for (const dep of deps) {
      if (dep === "stateManager" && dependencies.stateManager) {
        args.push(dependencies.stateManager);
      } else if (dep === "pageService" && dependencies.pageService) {
        args.push(dependencies.pageService);
      } else {
        throw new Error(`Missing dependency: ${dep}`);
      }
    }

    return new constructor(...args);
  }
}

// Register job types
JobRegistry.register("cookie-sync", CookieSyncJob, ["pageService"]);
JobRegistry.register("extraction", ExtractionJob, ["stateManager", "pageService"]);
