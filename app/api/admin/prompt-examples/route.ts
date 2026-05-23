import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { invalidateExamplesCache } from "@/lib/agent/examples";
import { PROMPT_EXAMPLES_SEED } from "@/lib/agent/prompt-examples-seed";

export const dynamic = "force-dynamic";

const CATEGORIES = ["conversation", "screening", "facts"] as const;
type Category = (typeof CATEGORIES)[number];

function isValidCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

// GET /api/admin/prompt-examples?category=conversation
export async function GET(req: NextRequest) {
  try {
    const category = new URL(req.url).searchParams.get("category");
    const supabase = createServiceClient();

    let q = supabase
      .from("prompt_examples")
      .select("*")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });

    if (category) {
      if (!isValidCategory(category)) {
        return NextResponse.json({ error: "잘못된 category" }, { status: 400 });
      }
      q = q.eq("category", category);
    }

    const { data, error } = await q;
    if (error) {
      console.error("[prompt-examples GET]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error("[prompt-examples GET exception]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

// POST /api/admin/prompt-examples  body: { category, title, body, sort_order? }
export async function POST(req: NextRequest) {
  try {
    const { category, title, body, sort_order } = await req.json();

    if (!isValidCategory(category)) {
      return NextResponse.json({ error: "category 필수" }, { status: 400 });
    }
    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json(
        { error: "title, body는 필수입니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // sort_order 미지정 시 해당 카테고리의 마지막 + 10
    let finalSort = typeof sort_order === "number" ? sort_order : 0;
    if (typeof sort_order !== "number") {
      const { data: last } = await supabase
        .from("prompt_examples")
        .select("sort_order")
        .eq("category", category)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      finalSort = (last?.sort_order ?? 0) + 10;
    }

    const { data, error } = await supabase
      .from("prompt_examples")
      .insert({
        category,
        title: title.trim(),
        body: body.trim(),
        sort_order: finalSort,
      })
      .select()
      .single();

    if (error) {
      console.error("[prompt-examples POST]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    invalidateExamplesCache();
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[prompt-examples POST exception]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

// PUT /api/admin/prompt-examples  body: { action: "seed" } — 기본 예시 일괄 INSERT (1회용)
export async function PUT(req: NextRequest) {
  try {
    const { action } = await req.json();
    if (action !== "seed") {
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 이미 데이터가 있으면 거부 (실수로 중복 시드 방지)
    const { count } = await supabase
      .from("prompt_examples")
      .select("id", { count: "exact", head: true });

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `이미 ${count}건의 예시가 있습니다. 비어 있을 때만 시드 가능합니다.` },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from("prompt_examples")
      .insert(PROMPT_EXAMPLES_SEED);

    if (error) {
      console.error("[prompt-examples seed]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    invalidateExamplesCache();
    return NextResponse.json({ success: true, inserted: PROMPT_EXAMPLES_SEED.length });
  } catch (err) {
    console.error("[prompt-examples PUT exception]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
