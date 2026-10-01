import { NextResponse } from "next/server";

/** Old clients and queued answers receive a final response without writing data. */
export async function POST() {
  return NextResponse.json({ error: "Trivia has retired. Your tasting notes are still available.", code: "feature_retired" }, {
    status: 410,
    headers: { "Cache-Control": "no-store" }
  });
}
