import { PageInfo } from "../types/PageInfo";

export class StateManager {
  private pages = new Map<string, PageInfo>();

  // Pages management
  getPages(): Map<string, PageInfo> {
    return this.pages;
  }

  getPage(pageId: string): PageInfo | undefined {
    return this.pages.get(pageId);
  }

  setPage(pageId: string, pageInfo: PageInfo): void {
    this.pages.set(pageId, pageInfo);
  }

  deletePage(pageId: string): boolean {
    return this.pages.delete(pageId);
  }

  hasPage(pageId: string): boolean {
    return this.pages.has(pageId);
  }
}
