import fs from "fs";
import path from "path";
import os from "os";

export interface LocalInstanceConfig {
  name: string;
  type: "local";
  port: number;
  pid: number;
  userDataDir: string;
  startedAt: string;
  status: "running" | "stopped";
  cdpEndpoint?: string;
  headless?: boolean;
}

export interface RemoteInstanceConfig {
  name: string;
  type: "remote";
  url: string;
  addedAt: string;
  status: "running" | "stopped";
}

export type InstanceConfig = LocalInstanceConfig | RemoteInstanceConfig;

export class InstanceManager {
  private configFile: string;
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(os.homedir(), ".pageflow");
    this.configFile = path.join(this.baseDir, "instances.json");
    this.ensureBaseDir();
  }

  private ensureBaseDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private readConfig(): Record<string, InstanceConfig> {
    if (!fs.existsSync(this.configFile)) {
      return {};
    }
    try {
      const content = fs.readFileSync(this.configFile, "utf-8");
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private writeConfig(config: Record<string, InstanceConfig>): void {
    fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2), "utf-8");
  }

  private findAvailablePort(startPort: number = 3100): number {
    const instances = this.readConfig();
    const usedPorts = new Set(
      Object.values(instances)
        .filter(
          (instance): instance is LocalInstanceConfig =>
            instance.type === "local",
        )
        .map((instance) => instance.port),
    );

    let port = startPort;
    while (usedPorts.has(port)) {
      port++;
    }
    return port;
  }

  private generateShortName(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "remote-";
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  addInstance(
    name: string,
    pid: number,
    port?: number,
    cdpEndpoint?: string,
    headless?: boolean,
  ): { port: number; userDataDir: string } {
    const instances = this.readConfig();

    const assignedPort = port || this.findAvailablePort();
    const userDataDir = path.join(this.baseDir, name, "user-data");

    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    instances[name] = {
      name,
      type: "local",
      port: assignedPort,
      pid,
      userDataDir,
      startedAt: new Date().toISOString(),
      status: "running",
      cdpEndpoint,
      headless,
    };

    this.writeConfig(instances);
    return { port: assignedPort, userDataDir };
  }

  addRemoteServer(url: string, name?: string): string {
    const instances = this.readConfig();
    const serverName = name || this.generateShortName();

    // Check if name already exists
    if (instances[serverName]) {
      throw new Error(`实例 "${serverName}" 已存在`);
    }

    instances[serverName] = {
      name: serverName,
      type: "remote",
      url,
      addedAt: new Date().toISOString(),
      status: "running",
    };

    this.writeConfig(instances);
    return serverName;
  }

  removeInstance(name: string): void {
    const instances = this.readConfig();
    delete instances[name];
    this.writeConfig(instances);
  }

  getInstance(name: string): InstanceConfig | null {
    const instances = this.readConfig();
    return instances[name] || null;
  }

  getAllInstances(): InstanceConfig[] {
    const instances = this.readConfig();
    return Object.values(instances).map((instance) => {
      // Backward compatibility: if no type, assume local
      if (!instance.type || instance.type === "local") {
        return {
          ...instance,
          type: "local" as const,
          status: this.isProcessRunning((instance as any).pid)
            ? "running"
            : "stopped",
        } as LocalInstanceConfig;
      } else {
        // Remote instances are always considered "running"
        return {
          ...instance,
          status: "running" as const,
        } as RemoteInstanceConfig;
      }
    });
  }

  getRunningInstances(): InstanceConfig[] {
    return this.getAllInstances().filter(
      (instance) => instance.status === "running",
    );
  }

  getDefaultInstance(): InstanceConfig | null {
    const defaultInstance = this.getInstance("default");
    if (defaultInstance) {
      if (
        defaultInstance.type === "local" &&
        this.isProcessRunning(defaultInstance.pid)
      ) {
        return defaultInstance;
      } else if (defaultInstance.type === "remote") {
        return defaultInstance;
      }
    }

    const running = this.getRunningInstances();
    return running.length > 0 ? running[0] : null;
  }

  getInstanceUrl(instance: InstanceConfig): string {
    if (instance.type === "remote") {
      return instance.url;
    } else {
      return `http://localhost:${instance.port}`;
    }
  }

  getRandomInstance(): InstanceConfig | null {
    const running = this.getRunningInstances();
    if (running.length === 0) return null;
    return running[Math.floor(Math.random() * running.length)];
  }

  getRoundRobinInstance(): InstanceConfig | null {
    const running = this.getRunningInstances();
    if (running.length === 0) return null;

    const stateFile = path.join(this.baseDir, "round-robin.json");
    let lastIndex = -1;

    if (fs.existsSync(stateFile)) {
      try {
        const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
        lastIndex = state.lastIndex ?? -1;
      } catch {
        lastIndex = -1;
      }
    }

    const nextIndex = (lastIndex + 1) % running.length;
    fs.writeFileSync(stateFile, JSON.stringify({ lastIndex: nextIndex }));

    return running[nextIndex];
  }
}
