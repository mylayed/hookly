import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Analysis, Hook, VerifiedRewrite } from "./analyzer/analyze";
import type { Pace, Platform } from "./analyzer/config";
import { HttpError } from "./api";
import type { Locale } from "./i18n/locales";
import { adminClient } from "./supabase";

// Saved checks. Reads go through the visitor's client (row-level security
// scopes them to their own rows); writes go through the admin client.

export type AnalysisView = Omit<Analysis, "usage">;
// `after` and `locale` are missing on rewrites saved before the re-check existed.
export type RewriteView = Omit<VerifiedRewrite, "usage" | "after"> & {
  after?: AnalysisView | null;
  // Language the rewrite notes and its re-check were written in.
  locale?: Locale;
};

export interface CheckDraft {
  script: string;
  platform: Platform;
  niche: string;
  pace: Pace;
}

export interface SavedCheck {
  id: string;
  createdAt: string;
  draft: CheckDraft;
  locale: Locale;
  analysis: AnalysisView;
  hooks: Hook[] | null;
  rewrite: RewriteView | null;
}

export interface CheckSummary {
  id: string;
  createdAt: string;
  title: string;
  platform: Platform;
  total: number;
  verdict: Analysis["verdict"];
}

interface CheckRow {
  id: string;
  created_at: string;
  script: string;
  platform: Platform;
  niche: string;
  pace: Pace;
  locale: Locale;
  analysis: AnalysisView;
  hooks: Hook[] | null;
  rewrite: RewriteView | null;
}

const HISTORY_PAGE = 50;

export async function saveCheck(userId: string, draft: CheckDraft, locale: Locale, analysis: AnalysisView): Promise<string> {
  const { data, error } = await adminClient()
    .from("checks")
    .insert({
      user_id: userId,
      script: draft.script,
      platform: draft.platform,
      niche: draft.niche,
      pace: draft.pace,
      locale,
      total: analysis.total,
      verdict: analysis.verdict,
      analysis,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw error;
  return data.id;
}

export async function getCheck(db: SupabaseClient, id: string): Promise<SavedCheck> {
  const { data, error } = await db
    .from("checks")
    .select("id, created_at, script, platform, niche, pace, locale, analysis, hooks, rewrite")
    .eq("id", id)
    .maybeSingle<CheckRow>();
  if (error) throw error;
  // Another user's check looks exactly like a missing one.
  if (!data) throw new HttpError(404, "not_found", "This check no longer exists.");
  return {
    id: data.id,
    createdAt: data.created_at,
    draft: { script: data.script, platform: data.platform, niche: data.niche, pace: data.pace },
    locale: data.locale,
    analysis: data.analysis,
    hooks: data.hooks,
    rewrite: data.rewrite,
  };
}

export async function listChecks(db: SupabaseClient): Promise<CheckSummary[]> {
  const { data, error } = await db
    .from("checks")
    .select("id, created_at, title, platform, total, verdict")
    .order("created_at", { ascending: false })
    .limit(HISTORY_PAGE);
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    title: r.title,
    platform: r.platform,
    total: r.total,
    verdict: r.verdict,
  }));
}

export async function deleteCheck(db: SupabaseClient, id: string) {
  const { error } = await db.from("checks").delete().eq("id", id);
  if (error) throw error;
}

// Ownership was already checked by loading the row with the visitor's client.
export async function saveExtras(id: string, extras: { hooks: Hook[] } | { rewrite: RewriteView }) {
  const { error } = await adminClient().from("checks").update(extras).eq("id", id);
  if (error) throw error;
}
