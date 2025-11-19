"use client";

import React, { useEffect, useState } from "react";
import styles from "./page.module.css";

interface WebhookData {
  timestamp: string;
  data: any;
  interval?: number;
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
  const [chartModalUrl, setChartModalUrl] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);

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

  const getNextUpdateTime = (timestamp: string, interval?: number) => {
    if (!interval) return "-";
    const lastUpdate = new Date(timestamp);
    const nextTime = new Date(lastUpdate.getTime() + interval * 60 * 1000);
    return `${nextTime.getHours().toString().padStart(2, '0')}:${nextTime.getMinutes().toString().padStart(2, '0')}`;
  };

  const handleDelete = async (url: string) => {
    if (!confirm(`确定要删除这条数据吗？\n\n这将同时删除对应的监控任务。`)) {
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
          ? `监控任务已启动\nJob ID: ${result.jobId}`
          : "监控任务已启动";
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

  const handleOpenChart = async (url: string) => {
    setChartModalUrl(url);
    setLoadingChart(true);

    try {
      const response = await fetch(`/api/xiaohongshu/history?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      setChartData(data);
    } catch (error) {
      console.error("加载图表数据失败:", error);
      setChartData([]);
    } finally {
      setLoadingChart(false);
    }
  };

  const handleCloseChart = () => {
    setChartModalUrl(null);
    setChartData([]);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>小红书笔记数据监控</h1>
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
          {starting ? "启动中..." : "启动监控"}
        </button>
      </div>

      {loading && <div className={styles.loading}>加载中...</div>}
      {error && <div className={styles.error}>{error}</div>}

      {dataList.length > 0 && (
        <div className={styles.content}>
          <div className={styles.stats}>共 {dataList.length} 条数据</div>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
            <thead>
              <tr>
                <th>标题</th>
                <th>作者</th>
                <th>发布时间</th>
                <th>更新时间</th>
                <th>下次更新</th>
                <th>点赞</th>
                <th>收藏</th>
                <th>评论</th>
                <th>图表</th>
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
                      <td>{getNextUpdateTime(item.timestamp, item.interval)}</td>
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
                          onClick={() => handleOpenChart(key)}
                          className={styles.chartBtn}
                        >
                          查看
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
                        <td colSpan={10}>
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
        </div>
      )}

      {chartModalUrl && (
        <div className={styles.modal} onClick={handleCloseChart}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>数据趋势图表</h2>
              <button onClick={handleCloseChart} className={styles.closeBtn}>×</button>
            </div>
            <div className={styles.modalBody}>
              {loadingChart ? (
                <div className={styles.loading}>加载中...</div>
              ) : chartData.length === 0 ? (
                <div className={styles.noData}>暂无历史数据</div>
              ) : (
                <ChartComponent data={chartData} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChartComponent({ data }: { data: any[] }) {
  const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = require("recharts");

  console.log('[ChartComponent] 原始数据:', data);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  };

  const formattedData = data.map((item, index) => {
    const formatted = {
      time: formatTime(item.timestamp),
      likes: item.likes,
      collects: item.collects,
      comments: item.comments
    };
    console.log(`[ChartComponent] 数据点 ${index}:`, formatted);
    return formatted;
  });

  console.log('[ChartComponent] 格式化后的数据总数:', formattedData.length);
  console.log('[ChartComponent] 第一个数据点:', formattedData[0]);
  console.log('[ChartComponent] 最后一个数据点:', formattedData[formattedData.length - 1]);

  return (
    <ResponsiveContainer width="100%" height={450}>
      <LineChart
        data={formattedData}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <defs>
          <linearGradient id="colorLikes" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorCollects" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorComments" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 12, fill: '#666' }}
          stroke="#d1d5db"
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#666' }}
          stroke="#d1d5db"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
          }}
        />
        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
          iconType="circle"
        />
        <Line
          type="monotone"
          dataKey="likes"
          stroke="#6366f1"
          strokeWidth={3}
          dot={{ fill: '#6366f1', r: 4 }}
          activeDot={{ r: 6 }}
          name="点赞"
          fill="url(#colorLikes)"
        />
        <Line
          type="monotone"
          dataKey="collects"
          stroke="#10b981"
          strokeWidth={3}
          dot={{ fill: '#10b981', r: 4 }}
          activeDot={{ r: 6 }}
          name="收藏"
          fill="url(#colorCollects)"
        />
        <Line
          type="monotone"
          dataKey="comments"
          stroke="#f59e0b"
          strokeWidth={3}
          dot={{ fill: '#f59e0b', r: 4 }}
          activeDot={{ r: 6 }}
          name="评论"
          fill="url(#colorComments)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
