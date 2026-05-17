import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const source = new URL(req.url).searchParams.get("source");

  let q = supabase
    .from("applicants")
    .select("*")
    .order("created_at", { ascending: false });

  if (source) q = q.eq("source", source);

  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
