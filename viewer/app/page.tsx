"use client";

import { useEffect, useState } from "react";
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

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>小红书数据监控</h1>
        <button onClick={() => fetchData(true)} className={styles.refreshBtn}>
          刷新数据
        </button>
      </header>

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
              {dataList.map((item) => {
                const post = item.data?.data?.post;
                const author = item.data?.data?.author;
                const stats = item.data?.data?.stats;
                const comments = item.data?.data?.comments || [];
                const key = item.data.extractedFrom || item.timestamp;
                const isExpanded = expandedComments.has(key);

                return (
                  <>
                    <tr key={key} className={styles.dataRow}>
                      <td className={styles.titleCol}>
                        <a href={post?.url} target="_blank" rel="noopener noreferrer" className={styles.titleLink}>
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
                        <a href={post?.url} target="_blank" rel="noopener noreferrer" className={styles.actionLink}>
                          查看原文
                        </a>
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
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
