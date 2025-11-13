import { StateManager } from "./StateManager";

export class ServerService {
  private stateManager: StateManager;
  private initialized: boolean = false;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  // Initialize server (no database needed)
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log("[ServerService] Initialized (file-based storage)");
    this.initialized = true;
  }
}
