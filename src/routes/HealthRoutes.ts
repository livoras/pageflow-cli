import { Request, Response, Application } from "express";
import { BaseRouteHandler } from "./BaseRouteHandler";

export class HealthRoutes extends BaseRouteHandler {
  registerRoutes(app: Application): void {
    app.get("/api/health", (req: Request, res: Response) => {
      res.json({ status: "ok" });
    });
  }
}
