import { Response, Application } from "express";
import { StateManager } from "../services/StateManager";
import { ResponseFormatter } from "../utils/ResponseFormatter";
import { ValidationError } from "../utils/ValidationError";

export abstract class BaseRouteHandler {
  protected stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  abstract registerRoutes(app: Application): void;

  protected handleError(
    res: Response,
    error: any,
    message: string = "Internal server error",
  ) {
    const timestamp = new Date().toISOString();
    const errorDetails = {
      message: error.message || message,
      timestamp,
      stack: error.stack,
    };

    console.error(`[${timestamp}] ${message}:`, errorDetails);

    let statusCode = 500;
    let errorMessage = error.message || message;

    if (error instanceof ValidationError) {
      statusCode = 400;
      errorMessage = error.message;
    } else if (
      error.name === "NotFoundError" ||
      errorMessage.includes("not found")
    ) {
      statusCode = 404;
      errorMessage = error.message || "Resource not found";
    } else if (error.name === "UnauthorizedError") {
      statusCode = 401;
      errorMessage = error.message || "Unauthorized access";
    } else if (error.name === "ForbiddenError") {
      statusCode = 403;
      errorMessage = error.message || "Forbidden access";
    }

    ResponseFormatter.error(res, statusCode, errorMessage);
  }

  protected logInfo(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] INFO: ${message}`,
      data ? JSON.stringify(data) : "",
    );
  }

  protected logWarning(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    console.warn(
      `[${timestamp}] WARNING: ${message}`,
      data ? JSON.stringify(data) : "",
    );
  }

  /**
   * Get page info and send error response if not found
   */
  protected getPageInfoOrError(res: Response, pageId: string) {
    const pageInfo = this.stateManager.getPages().get(pageId);
    if (!pageInfo) {
      ResponseFormatter.notFound(res, "Page not found");
      return null;
    }
    return pageInfo;
  }
}
