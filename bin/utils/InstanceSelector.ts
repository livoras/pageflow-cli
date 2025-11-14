import { InstanceManager } from "../../src/utils/InstanceManager";
import { isProcessRunning } from "./process";

export class InstanceSelector {
  constructor(
    private instanceManager: InstanceManager,
    private fallbackEndpoint?: string,
  ) {}

  async select(options: {
    use?: string;
    random?: boolean;
  }): Promise<{ endpoint: string; instanceName?: string }> {
    if (options.use) {
      const instance = this.instanceManager.getInstance(options.use);
      if (!instance) {
        console.error(`Error: Instance "${options.use}" does not exist`);
        process.exit(1);
      }
      if (instance.type === "local") {
        const running = await isProcessRunning(instance.pid);
        if (!running) {
          console.error(`Error: Instance "${options.use}" is not running`);
          process.exit(1);
        }
      }
      const endpoint = this.instanceManager.getInstanceUrl(instance);
      console.error(`Using instance: ${options.use}`);
      return { endpoint, instanceName: options.use };
    }

    if (options.random) {
      const instance = this.instanceManager.getRandomInstance();
      if (!instance) {
        console.error("Error: No running instances");
        process.exit(1);
      }
      const endpoint = this.instanceManager.getInstanceUrl(instance);
      console.error(`Randomly selected instance: ${instance.name}`);
      return { endpoint, instanceName: instance.name };
    }

    // Default
    const instance = this.instanceManager.getDefaultInstance();
    if (instance) {
      const endpoint = this.instanceManager.getInstanceUrl(instance);
      console.error(`Using instance: ${instance.name}`);
      return { endpoint, instanceName: instance.name };
    }

    // Fallback if configured
    if (this.fallbackEndpoint) {
      console.error("Using remote server");
      return { endpoint: this.fallbackEndpoint };
    }

    console.error("Error: No running instances");
    process.exit(1);
  }
}
