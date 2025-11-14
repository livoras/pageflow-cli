"use client";

import { useEffect, useState } from "react";

interface WebhookData {
  timestamp: string;
  data: any;
}

export default function Home() {
  const [dataList, setDataList] = useState<WebhookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
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
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h1>Xiaohongshu Webhook Data</h1>

      <div style={{ marginBottom: "20px" }}>
        <button
          onClick={fetchData}
          style={{
            padding: "8px 16px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      {loading && <p>Loading...</p>}

      {error && (
        <div style={{ padding: "10px", background: "#f8d7da", color: "#721c24", borderRadius: "4px" }}>
          {error}
        </div>
      )}

      {dataList.length > 0 && (
        <div>
          <p>
            <strong>Total:</strong> {dataList.length} items
          </p>
          {dataList.map((item) => (
            <div
              key={item.data.extractedFrom || item.timestamp}
              style={{
                marginBottom: "30px",
                padding: "15px",
                border: "1px solid #ddd",
                borderRadius: "5px",
              }}
            >
              <p>
                <strong>Received at:</strong> {item.timestamp}
              </p>
              <p>
                <strong>URL:</strong> {item.data.extractedFrom || "unknown"}
              </p>
              <div style={{ marginTop: "10px" }}>
                <h3>Data:</h3>
                <pre
                  style={{
                    background: "#f5f5f5",
                    padding: "15px",
                    borderRadius: "4px",
                    overflow: "auto",
                    maxHeight: "600px",
                  }}
                >
                  {JSON.stringify(item.data, null, 2)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
