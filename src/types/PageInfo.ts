import * as playwright from "playwright";
import { SimplePage } from "../SimplePage";

export interface PageInfo {
  id: string;
  name: string;
  description?: string;
  page: playwright.Page;
  simplePage: SimplePage;
  createdAt: Date;
  cachedXPathMap?: Record<string, string>;
}
