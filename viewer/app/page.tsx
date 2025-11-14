"use client";

import React, { useEffect, useState } from "react";
import styles from "./page.module.css";

interface WebhookData {
  timestamp: string;
  data: any;
  changes?: {
    likes?: number;
    collects?: number;
    comments?: number;
  };
}

export default function Home() {
  const [dataList, setDataList] = useState<WebhookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [newUrl, setNewUrl] = useState("");
  const [starting, setStarting] = useState(false);

  const fetchData = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const response = await fetch("/api/xiaohongshu/view");
      const result = await response.json();

      if (result.message === "No data yet") {
        setError("No data yet");
        setDataList([]);
      } else {
        setDataList(result);
      }
    } catch (err) {
      setError("Failed to fetch data");
      console.error(err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleComments = (key: string) => {
    setExpandedComments((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const getRelativeTime = (timestamp: string) => {
    const now = new Date().getTime();
    const time = new Date(timestamp).getTime();
    const diff = now - time;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} 天前`;
    if (hours > 0) return `${hours} 小时前`;
    if (minutes > 0) return `${minutes} 分钟前`;
    return "刚刚";
  };

  const extractNumber = (value: any) => {
    if (!value) return "0";
    const str = value.toString();
    const numbers = str.replace(/[^\d]/g, "");
    return numbers || "0";
  };

  const renderChange = (change: number | undefined) => {
    if (!change || change === 0) return null;
    const className = change > 0 ? styles.changePositive : styles.changeNegative;
    const sign = change > 0 ? "+" : "";
    return <span className={className}> ({sign}{change})</span>;
  };

  const handleDelete = async (url: string) => {
    if (!confirm(`确定要删除这条数据吗？\n\n这将同时删除对应的爬虫任务。`)) {
      return;
    }

    setDeleting(prev => new Set(prev).add(url));

    try {
      const response = await fetch(`/api/xiaohongshu/delete?url=${encodeURIComponent(url)}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        if (result.warning) {
          alert(`删除成功，但有警告：\n\n${result.warning}`);
        }
        await fetchData(false);
      } else {
        console.error("删除失败:", result);
        const errorDetails = [
          `错误: ${result.error || "未知错误"}`,
          result.message && `消息: ${result.message}`,
          result.stderr && `stderr:\n${result.stderr}`,
          result.stdout && `stdout:\n${result.stdout}`,
          result.code && `错误码: ${result.code}`,
        ].filter(Boolean).join("\n\n");
        alert(`删除失败\n\n${errorDetails}`);
      }
    } catch (error: any) {
      console.error("删除失败: 网络错误", error);
      alert(`删除失败: 网络错误\n\n${error.message || error}`);
    } finally {
      setDeleting(prev => {
        const newSet = new Set(prev);
        newSet.delete(url);
        return newSet;
      });
    }
  };

  const handleStart = async () => {
    if (!newUrl.trim()) {
      alert("请输入 URL");
      return;
    }

    setStarting(true);

    try {
      const response = await fetch("/api/xiaohongshu/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: newUrl }),
      });

      const result = await response.json();

      if (result.success) {
        const message = result.jobId
          ? `爬虫任务已启动\nJob ID: ${result.jobId}`
          : "爬虫任务已启动";
        alert(message);
        setNewUrl("");
      } else {
        console.error("启动失败:", result);
        const errorDetails = [
          `错误: ${result.error || "未知错误"}`,
          result.message && `消息: ${result.message}`,
          result.stderr && `stderr:\n${result.stderr}`,
          result.stdout && `stdout:\n${result.stdout}`,
          result.code && `错误码: ${result.code}`,
        ].filter(Boolean).join("\n\n");
        alert(`启动失败\n\n${errorDetails}`);
      }
    } catch (error: any) {
      console.error("启动失败: 网络错误", error);
      alert(`启动失败: 网络错误\n\n${error.message || error}`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>小红书数据监控</h1>
        <button onClick={() => fetchData(true)} className={styles.refreshBtn}>
          刷新数据
        </button>
      </header>

      <div className={styles.startForm}>
        <input
          type="text"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="输入小红书帖子 URL"
          className={styles.urlInput}
          disabled={starting}
        />
        <button
          onClick={handleStart}
          disabled={starting || !newUrl.trim()}
          className={styles.startBtn}
        >
          {starting ? "启动中..." : "启动爬虫"}
        </button>
      </div>

      {loading && <div className={styles.loading}>加载中...</div>}
      {error && <div className={styles.error}>{error}</div>}

      {dataList.length > 0 && (
        <div className={styles.content}>
          <div className={styles.stats}>共 {dataList.length} 条数据</div>

          <table className={styles.table}>
            <thead>
              <tr>
                <th>标题</th>
                <th>作者</th>
                <th>发布时间</th>
                <th>更新时间</th>
                <th>点赞</th>
                <th>收藏</th>
                <th>评论</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {dataList.map((item, index) => {
                const post = item.data?.data?.post;
                const author = item.data?.data?.author;
                const stats = item.data?.data?.stats;
                const comments = item.data?.data?.comments || [];
                const key = item.data.extractedFrom || item.timestamp;
                const isExpanded = expandedComments.has(key);

                return (
                  <React.Fragment key={key}>
                    <tr className={styles.dataRow}>
                      <td className={styles.titleCol}>
                        <a href={item.data.extractedFrom} target="_blank" rel="noopener noreferrer" className={styles.titleLink}>
                          {post?.title || "无标题"}
                        </a>
                      </td>
                      <td>
                        <div className={styles.authorCell}>
                          <img src={author?.avatar} alt={author?.name} className={styles.authorAvatar} />
                          <span>{author?.name || "未知作者"}</span>
                        </div>
                      </td>
                      <td>{post?.publish_time || item.timestamp}</td>
                      <td>{getRelativeTime(item.timestamp)}</td>
                      <td className={styles.statCell}>
                        {extractNumber(stats?.likes)}
                        {renderChange(item.changes?.likes)}
                      </td>
                      <td className={styles.statCell}>
                        {extractNumber(stats?.collects)}
                        {renderChange(item.changes?.collects)}
                      </td>
                      <td className={styles.statCell}>
                        <button onClick={() => toggleComments(key)} className={styles.commentBtn}>
                          {extractNumber(stats?.total_comments)}
                          {renderChange(item.changes?.comments)}
                        </button>
                      </td>
                      <td>
                        <button
                          onClick={() => handleDelete(key)}
                          disabled={deleting.has(key)}
                          className={styles.deleteBtn}
                        >
                          {deleting.has(key) ? "删除中..." : "删除"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && comments.length > 0 && (
                      <tr key={`${key}-comments`} className={styles.commentsRow}>
                        <td colSpan={8}>
                          <div className={styles.commentsList}>
                            {comments.slice(0, 5).map((comment: any, idx: number) => (
                              <div key={idx} className={styles.commentItem}>
                                <img src={comment.author_avatar} alt={comment.author_name} className={styles.commentAvatar} />
                                <div className={styles.commentContent}>
                                  <div className={styles.commentMeta}>
                                    <span className={styles.commentAuthor}>{comment.author_name}</span>
                                    <span className={styles.commentTime}>{comment.time} {comment.location}</span>
                                  </div>
                                  <p className={styles.commentText}>{comment.content}</p>
                                  {comment.comment_image && (
                                    <img src={comment.comment_image} alt="评论图片" className={styles.commentImage} />
                                  )}
                                  <div className={styles.commentStats}>
                                    <span>赞 {comment.likes}</span>
                                    <span>回复 {comment.replies}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
