import { NextRequest, NextResponse } from "next/server";
import { settingsStore } from "@/lib/settings";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await settingsStore.getSettings();
    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("获取配置失败:", error);
    return NextResponse.json(
      { error: "获取配置失败", message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const updates = await request.json();
    const settings = await settingsStore.updateSettings(updates);
    console.log("配置已更新:", settings);
    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error: any) {
    console.error("更新配置失败:", error);
    return NextResponse.json(
      { error: "更新配置失败", message: error.message },
      { status: 500 }
    );
  }
}
