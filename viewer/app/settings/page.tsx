"use client";

import React, { useEffect, useState } from "react";
import styles from "./settings.module.css";

interface Settings {
  interval: number;
  wechatWebhookUrls: string[];
  likesThreshold: number;
  commentsThreshold: number;
  maxJobs: number;
  likesIncrement: number;
  commentsIncrement: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    interval: 10,
    wechatWebhookUrls: [],
    likesThreshold: 20,
    commentsThreshold: 10,
    maxJobs: 10,
    likesIncrement: 10,
    commentsIncrement: 5,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/settings");
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error("获取配置失败:", error);
      setMessage({ type: "error", text: "获取配置失败" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: "success", text: "配置保存成功" });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: "error", text: result.error || "保存失败" });
      }
    } catch (error: any) {
      console.error("保存配置失败:", error);
      setMessage({ type: "error", text: error.message || "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof Settings, value: string | number) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAddWebhookUrl = () => {
    setSettings((prev) => ({
      ...prev,
      wechatWebhookUrls: [...prev.wechatWebhookUrls, ""],
    }));
  };

  const handleWebhookUrlChange = (index: number, value: string) => {
    setSettings((prev) => ({
      ...prev,
      wechatWebhookUrls: prev.wechatWebhookUrls.map((url, i) => i === index ? value : url),
    }));
  };

  const handleRemoveWebhookUrl = (index: number) => {
    setSettings((prev) => ({
      ...prev,
      wechatWebhookUrls: prev.wechatWebhookUrls.filter((_, i) => i !== index),
    }));
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>加载中...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>配置管理</h1>
        <a href="/" className={styles.backLink}>
          返回首页
        </a>
      </header>

      <div className={styles.content}>
        <div className={styles.formGroup}>
          <label className={styles.label}>
            新任务提取间隔（分钟）
            <span className={styles.hint}>仅对新启动的任务生效</span>
          </label>
          <input
            type="number"
            value={settings.interval}
            onChange={(e) => handleChange("interval", parseFloat(e.target.value))}
            className={styles.input}
            min="0.1"
            step="0.1"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>企业微信 Webhook URL</label>
          {settings.wechatWebhookUrls.map((url, index) => (
            <div key={index} className={styles.webhookUrlRow}>
              <input
                type="text"
                value={url}
                onChange={(e) => handleWebhookUrlChange(index, e.target.value)}
                className={styles.input}
                placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
              />
              <button
                type="button"
                onClick={() => handleRemoveWebhookUrl(index)}
                className={styles.removeBtn}
              >
                删除
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={handleAddWebhookUrl}
            className={styles.addBtn}
          >
            添加 Webhook URL
          </button>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>点赞阈值</label>
          <input
            type="number"
            value={settings.likesThreshold}
            onChange={(e) => handleChange("likesThreshold", parseInt(e.target.value))}
            className={styles.input}
            min="0"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>评论阈值</label>
          <input
            type="number"
            value={settings.commentsThreshold}
            onChange={(e) => handleChange("commentsThreshold", parseInt(e.target.value))}
            className={styles.input}
            min="0"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>最大任务数</label>
          <input
            type="number"
            value={settings.maxJobs}
            onChange={(e) => handleChange("maxJobs", parseInt(e.target.value))}
            className={styles.input}
            min="1"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>
            点赞增量阈值
            <span className={styles.hint}>点赞数增量超过此值时触发通知</span>
          </label>
          <input
            type="number"
            value={settings.likesIncrement}
            onChange={(e) => handleChange("likesIncrement", parseInt(e.target.value))}
            className={styles.input}
            min="0"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>
            评论增量阈值
            <span className={styles.hint}>评论数增量超过此值时触发通知</span>
          </label>
          <input
            type="number"
            value={settings.commentsIncrement}
            onChange={(e) => handleChange("commentsIncrement", parseInt(e.target.value))}
            className={styles.input}
            min="0"
          />
        </div>

        {message && (
          <div className={message.type === "success" ? styles.success : styles.error}>
            {message.text}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className={styles.saveBtn}
        >
          {saving ? "保存中..." : "保存配置"}
        </button>
      </div>
    </div>
  );
}
