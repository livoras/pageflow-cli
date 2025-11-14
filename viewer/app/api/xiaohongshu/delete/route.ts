import { NextRequest, NextResponse } from "next/server";
import { dataStore } from "@/lib/store";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL parameter is required" }, { status: 400 });
  }

  dataStore.deleteData(url);

  const { stdout } = await execAsync("./pageflow jobs list tago", {
    cwd: process.cwd() + "/..",
  });

  const lines = stdout.split("\n");
  let jobId: string | null = null;

  for (const line of lines) {
    if (line.includes(url) || (url.includes("xiaohongshu.com") && line.includes("xiaohongshu.com")) || (url.includes("xhslink.com") && line.includes("xhslink.com"))) {
      const match = line.match(/([a-z0-9]{6})/);
      if (match) {
        jobId = match[1];
        break;
      }
    }
  }

  if (jobId) {
    await execAsync(`./pageflow jobs stop ${jobId} tago`, {
      cwd: process.cwd() + "/..",
    });
  }

  return NextResponse.json({
    success: true,
    deletedUrl: url,
    stoppedJob: jobId
  });
}
