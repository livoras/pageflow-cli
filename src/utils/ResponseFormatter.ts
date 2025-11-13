import { Response } from "express";

export class ResponseFormatter {
  static success(
    res: Response,
    payload: Record<string, unknown> = {},
    status = 200,
  ): Response {
    return res.status(status).json({ success: true, ...payload });
  }

  static created(res: Response, payload: Record<string, unknown>): Response {
    return res.status(201).json(payload);
  }

  static error(res: Response, status: number, message: string): Response {
    return res.status(status).json({ error: message });
  }

  static badRequest(res: Response, message: string): Response {
    return this.error(res, 400, message);
  }

  static notFound(res: Response, message: string): Response {
    return this.error(res, 404, message);
  }

  static unauthorized(res: Response, message: string): Response {
    return this.error(res, 401, message);
  }

  static forbidden(res: Response, message: string): Response {
    return this.error(res, 403, message);
  }

  static serverError(res: Response, message: string): Response {
    return this.error(res, 500, message);
  }
}
