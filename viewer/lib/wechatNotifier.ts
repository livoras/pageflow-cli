const WECHAT_WEBHOOK_URL = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=d18c52a5-f561-4ec6-8482-fdc8b94f36ec";

interface NotificationData {
  title: string;
  url: string;
  likes: number;
  comments: number;
  collects?: number;
  author?: string;
}

export async function sendWeChatNotification(data: NotificationData): Promise<boolean> {
  const message = {
    msgtype: "markdown",
    markdown: {
      content: `## 🔥 小红书笔记热门提醒

**标题**: ${data.title}
**作者**: ${data.author || "未知"}
**点赞**: <font color="warning">${data.likes}</font>
**评论**: <font color="info">${data.comments}</font>
${data.collects ? `**收藏**: ${data.collects}` : ""}

[查看详情](${data.url})`
    }
  };

  try {
    const response = await fetch(WECHAT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();

    if (result.errcode === 0) {
      console.log("企业微信通知发送成功:", data.title);
      return true;
    } else {
      console.error("企业微信通知发送失败:", result);
      return false;
    }
  } catch (error) {
    console.error("发送企业微信通知时出错:", error);
    return false;
  }
}
