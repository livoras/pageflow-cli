import { settingsStore } from "./settings";

interface NotificationData {
  title: string;
  url: string;
  likes: number;
  comments: number;
  collects?: number;
  author?: string;
}

export async function sendWeChatNotification(data: NotificationData): Promise<boolean> {
  const settings = settingsStore.getSettings();
  const webhookUrls = settings.wechatWebhookUrls;

  if (!webhookUrls || webhookUrls.length === 0) {
    console.log("未配置企业微信 Webhook URL，跳过通知");
    return false;
  }

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

  const sendToWebhook = async (url: string) => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      const result = await response.json();

      if (result.errcode === 0) {
        console.log(`企业微信通知发送成功 (${url}):`, data.title);
        return true;
      } else {
        console.error(`企业微信通知发送失败 (${url}):`, result);
        return false;
      }
    } catch (error) {
      console.error(`发送企业微信通知时出错 (${url}):`, error);
      return false;
    }
  };

  const results = await Promise.allSettled(
    webhookUrls.map(url => sendToWebhook(url))
  );

  const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  console.log(`企业微信通知发送完成: ${successCount}/${webhookUrls.length} 成功`);

  return successCount > 0;
}
