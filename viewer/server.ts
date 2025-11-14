import express, { Request, Response } from "express";

const app = express();
const PORT = 9999;

app.use(express.json());

let latestXiaohongshuData: {
  timestamp: string;
  data: any;
} | null = null;

let latestBaiduData: {
  timestamp: string;
  data: any;
} | null = null;

app.post("/xiaohongshu/webhook", (req: Request, res: Response) => {
  const receivedAt = new Date().toISOString();

  latestXiaohongshuData = {
    timestamp: receivedAt,
    data: req.body,
  };

  console.log(`[${receivedAt}] Received xiaohongshu webhook data`);
  console.log(`Data size: ${JSON.stringify(req.body).length} bytes`);

  res.json({
    success: true,
    received: receivedAt,
  });
});

app.get("/xiaohongshu/view", (req: Request, res: Response) => {
  if (!latestXiaohongshuData) {
    return res.json({
      message: "No data yet",
    });
  }

  res.json(latestXiaohongshuData);
});

app.post("/baidu/webhook", (req: Request, res: Response) => {
  const receivedAt = new Date().toISOString();

  latestBaiduData = {
    timestamp: receivedAt,
    data: req.body,
  };

  console.log(`[${receivedAt}] Received baidu webhook data`);
  console.log(`Data size: ${JSON.stringify(req.body).length} bytes`);

  res.json({
    success: true,
    received: receivedAt,
  });
});

app.get("/baidu/view", (req: Request, res: Response) => {
  if (!latestBaiduData) {
    return res.json({
      message: "No data yet",
    });
  }

  res.json(latestBaiduData);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Webhook viewer server running on http://0.0.0.0:${PORT}`);
  console.log(`- Xiaohongshu webhook: POST /xiaohongshu/webhook`);
  console.log(`- Xiaohongshu view: GET /xiaohongshu/view`);
  console.log(`- Baidu webhook: POST /baidu/webhook`);
  console.log(`- Baidu view: GET /baidu/view`);
});
