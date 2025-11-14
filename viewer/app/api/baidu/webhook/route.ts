import { NextRequest, NextResponse } from "next/server";
import { dataStore } from "@/lib/store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    dataStore.setBaiduData(body);

    console.log(`[${new Date().toISOString()}] Received baidu webhook`);
    console.log(`Data size: ${JSON.stringify(body).length} bytes`);

    return NextResponse.json({
      success: true,
      received: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error processing baidu webhook:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}
