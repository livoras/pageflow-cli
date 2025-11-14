import { NextRequest, NextResponse } from "next/server";
import { dataStore } from "@/lib/store";

export async function GET(request: NextRequest) {
  const data = dataStore.getXiaohongshuData();

  if (data.length === 0) {
    return NextResponse.json({ message: "No data yet" });
  }

  return NextResponse.json(data);
}
