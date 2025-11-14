import Link from "next/link";

export default function Home() {
  return (
    <div>
      <h1>Pageflow Webhook Viewer</h1>
      <p>Select a data source to view:</p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        <li style={{ marginBottom: "10px" }}>
          <Link
            href="/xiaohongshu"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: "#007bff",
              color: "white",
              textDecoration: "none",
              borderRadius: "4px"
            }}
          >
            Xiaohongshu Data
          </Link>
        </li>
        <li>
          <Link
            href="/baidu"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: "#28a745",
              color: "white",
              textDecoration: "none",
              borderRadius: "4px"
            }}
          >
            Baidu Data
          </Link>
        </li>
      </ul>
    </div>
  );
}
