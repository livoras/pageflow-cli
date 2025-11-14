"use client";

import React, { useEffect, useState } from "react";
import styles from "./settings.module.css";

interface Settings {
  interval: number;
  wechatWebhookUrl: string;
  likesThreshold: number;
  commentsThreshold: number;
  maxJobs: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    interval: 10,
    wechatWebhookUrl: "",
    likesThreshold: 20,
    commentsThreshold: 10,
    maxJobs: 10,
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
          <input
            type="text"
            value={settings.wechatWebhookUrl}
            onChange={(e) => handleChange("wechatWebhookUrl", e.target.value)}
            className={styles.input}
            placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
          />
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
