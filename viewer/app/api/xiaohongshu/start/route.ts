import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const webhookUrl = "http://8.155.175.166:7005/api/xiaohongshu/webhook";
    const extractionId = "24";
    const interval = "10";

    const command = `pageflow extract --use tago --interval ${interval} --webhook "${webhookUrl}" "${url}" ${extractionId}`;
    console.log("执行命令:", command);

    const { stdout, stderr } = await execAsync(command);

    const jobIdMatch = stdout.match(/Job ID: ([a-z0-9]{6})/);
    const jobId = jobIdMatch ? jobIdMatch[1] : null;

    return NextResponse.json({
      success: true,
      jobId,
      message: "爬虫任务已启动",
      output: stdout,
    });
  } catch (error: any) {
    console.error("启动任务失败:", {
      message: error.message,
      stdout: error.stdout,
      stderr: error.stderr,
      code: error.code,
      stack: error.stack
    });
    return NextResponse.json(
      {
        success: false,
        error: "启动任务失败",
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
