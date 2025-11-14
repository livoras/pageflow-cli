import { NextRequest, NextResponse } from "next/server";
import { dataStore } from "@/lib/store";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ success: false, error: "URL parameter is required" }, { status: 400 });
    }

    dataStore.deleteData(url);

    const listCommand = "pageflow jobs list --use tago --full";
    console.log("执行命令:", listCommand);
    const { stdout } = await execAsync(listCommand);

    let jobs;
    try {
      jobs = JSON.parse(stdout);
    } catch (error: any) {
      console.error("解析 JSON 失败:", error.message, "输出:", stdout);
      throw new Error(`Failed to parse jobs JSON: ${error.message}`);
    }

    let jobId: string | null = null;

    for (const job of jobs) {
      const jobUrl = job.config?.url;
      console.log("检查 job:", job.id, "URL:", jobUrl);
      if (jobUrl === url) {
        jobId = job.id;
        console.log("精确匹配到 job ID:", jobId);
        break;
      }
    }

    if (!jobId) {
      console.warn("未找到匹配的 job，URL:", url);
    }

    if (jobId) {
      const deleteCommand = `pageflow jobs delete ${jobId} --use tago`;
      console.log("执行命令:", deleteCommand);
      await execAsync(deleteCommand);
    }

    return NextResponse.json({
      success: true,
      deletedUrl: url,
      deletedJob: jobId,
      warning: jobId ? null : "未找到对应的 job，可能已被删除或 URL 不匹配"
    });
  } catch (error: any) {
    console.error("删除失败:", {
      message: error.message,
      stdout: error.stdout,
      stderr: error.stderr,
      code: error.code,
      stack: error.stack
    });
    return NextResponse.json(
      {
        success: false,
        error: "删除失败",
        message: error.message,
        stdout: error.stdout || "",
        stderr: error.stderr || "",
        code: error.code,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}
