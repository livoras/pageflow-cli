import { NextRequest, NextResponse } from "next/server";
import { dataStore, notificationStore } from "@/lib/store";
import { sendWeChatNotification } from "@/lib/wechatNotifier";
import { settingsStore } from "@/lib/settings";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    dataStore.setData(body);

    console.log(`[${new Date().toISOString()}] Received xiaohongshu webhook`);
    console.log(`Data size: ${JSON.stringify(body).length} bytes`);

    // Check if notification threshold is reached
    const url = body.extractedFrom || "unknown";
    const stats = body?.data?.stats;
    const post = body?.data?.post;
    const author = body?.data?.author;

    if (stats && post && url !== "unknown") {
      const extractNum = (val: any) => {
        if (!val) return 0;
        const str = val.toString().replace(/[^\d]/g, "");
        return parseInt(str) || 0;
      };

      const likes = extractNum(stats.likes);
      const comments = extractNum(stats.total_comments);
      const collects = extractNum(stats.collects);

      console.log(`笔记数据 - 点赞: ${likes}, 评论: ${comments}, 收藏: ${collects}`);

      const settings = settingsStore.getSettings();
      if (likes >= settings.likesThreshold && comments >= settings.commentsThreshold) {
        if (!notificationStore.isNotified(url)) {
          console.log(`达到阈值，发送通知: ${post.title}`);

          const notificationSent = await sendWeChatNotification({
            title: post.title || "无标题",
            url: url,
            likes: likes,
            comments: comments,
            collects: collects,
            author: author?.name,
          });

          if (notificationSent) {
            notificationStore.markAsNotified(url);
            console.log(`通知已发送并记录: ${url}`);
          }
        } else {
          console.log(`已发送过通知，跳过: ${post.title}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      received: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error processing xiaohongshu webhook:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}
