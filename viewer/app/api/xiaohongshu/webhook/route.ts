import { NextRequest, NextResponse } from "next/server";
import { dataStore, notificationStore } from "@/lib/store";
import { sendWeChatNotification } from "@/lib/wechatNotifier";
import { settingsStore } from "@/lib/settings";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

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

      const settings = await settingsStore.getSettings();

      // 先获取首次快照数据（在保存新数据之前）
      const firstSnapshot = await dataStore.getFirstSnapshot(url);

      if (firstSnapshot) {
        const firstStats = firstSnapshot.data?.data?.stats;
        const firstLikes = extractNum(firstStats?.likes);
        const firstComments = extractNum(firstStats?.total_comments);

        // 计算增量
        const likesIncrement = likes - firstLikes;
        const commentsIncrement = comments - firstComments;

        console.log(`增量数据 - 点赞增量: ${likesIncrement}, 评论增量: ${commentsIncrement}`);

        // 判断：点赞增量 >= 阈值 OR 评论增量 >= 阈值
        if (likesIncrement >= settings.likesIncrement || commentsIncrement >= settings.commentsIncrement) {
          if (!(await notificationStore.isNotified(url))) {
            console.log(`增量达到阈值，发送通知: ${post.title}`);
            console.log(`  点赞: ${firstLikes} → ${likes} (+${likesIncrement})`);
            console.log(`  评论: ${firstComments} → ${comments} (+${commentsIncrement})`);

            const notificationSent = await sendWeChatNotification({
              title: post.title || "无标题",
              url: url,
              likes: likes,
              comments: comments,
              collects: collects,
              author: author?.name,
              likesIncrement: likesIncrement,
              commentsIncrement: commentsIncrement,
              collectsIncrement: collects - extractNum(firstSnapshot.data?.data?.stats?.collects),
            });

            if (notificationSent) {
              await notificationStore.markAsNotified(url);
              console.log(`通知已发送并记录: ${url}`);
            }
          } else {
            console.log(`已发送过通知，跳过: ${post.title}`);
          }
        }
      } else {
        console.log(`首次数据采集，建立基准线: ${post.title}`);
      }
    }

    // 保存数据（放在通知逻辑之后）
    await dataStore.setData(body);

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
