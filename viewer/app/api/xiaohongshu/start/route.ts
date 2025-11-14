import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { settingsStore } from "@/lib/settings";

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const settings = settingsStore.getSettings();

    const { stdout: jobsOutput } = await execAsync("pageflow jobs list --use tago");
    const runningJobsCount = (jobsOutput.match(/Running/g) || []).length;

    if (runningJobsCount >= settings.maxJobs) {
      return NextResponse.json(
        {
          success: false,
          error: `任务数已达上限 (${runningJobsCount}/${settings.maxJobs})`,
          message: "请在配置页面调整最大任务数或停止部分任务后重试",
        },
        { status: 400 }
      );
    }

    const webhookUrl = "http://8.155.175.166:7005/api/xiaohongshu/webhook";
    const extractionId = "24";
    const interval = settings.interval.toString();

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
