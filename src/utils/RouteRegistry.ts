import { Application } from "express";
import { BaseRouteHandler } from "../routes/BaseRouteHandler";

export class RouteRegistry {
  private handlers: BaseRouteHandler[] = [];

  addHandler(handler: BaseRouteHandler): void {
    this.handlers.push(handler);
  }

  registerAllRoutes(app: Application): void {
    this.handlers.forEach((handler) => {
      handler.registerRoutes(app);
    });
  }

  getHandlers(): BaseRouteHandler[] {
    return [...this.handlers];
  }
}
