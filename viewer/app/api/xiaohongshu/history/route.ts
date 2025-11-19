import { NextRequest, NextResponse } from "next/server";
import { dataStore } from "@/lib/store";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400 }
    );
  }

  try {
    const history = await dataStore.getHistory(url, 100);

    // 提取点赞、收藏、评论数据
    const chartData = history.map(item => {
      const stats = item.data?.data?.stats;
      const extractNum = (val: any) => {
        if (!val) return 0;
        const str = val.toString().replace(/[^\d]/g, "");
        return parseInt(str) || 0;
      };

      return {
        timestamp: item.timestamp,
        likes: extractNum(stats?.likes),
        collects: extractNum(stats?.collects),
        comments: extractNum(stats?.total_comments),
      };
    }).reverse(); // 按时间正序排列

    return NextResponse.json(chartData);
  } catch (error: any) {
    console.error("获取历史数据失败:", error);
    return NextResponse.json(
      { error: "Failed to fetch history", message: error.message },
      { status: 500 }
    );
  }
}
