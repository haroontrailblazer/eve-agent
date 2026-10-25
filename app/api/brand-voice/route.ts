import { NextResponse } from "next/server";
import { BrandAccessError, getBrandIdForUser } from "@/lib/brand-access";
import { getBrandSettings } from "@/lib/db/brands";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";
import { getActiveVoiceGuide, listVoiceExamples, listVoiceGuideVersions, listVoicePreferences } from "@/lib/voice/store";
import type { BrandVoiceSnapshot } from "@/lib/voice/view";

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET() {
  const setupStatus = await getSetupStatus();

  if (!setupStatus.appReady) {
    return NextResponse.json({ snapshot: null }, { status: 503, headers: NO_STORE });
  }

  const viewer = await getServerViewer(setupStatus);

  if (!viewer) {
    return NextResponse.json({ snapshot: null }, { status: 401, headers: NO_STORE });
  }

  let brandId: string;

  try {
    brandId = await getBrandIdForUser(viewer);
  } catch (error) {
    if (error instanceof BrandAccessError) {
      return NextResponse.json({ snapshot: null }, { status: 403, headers: NO_STORE });
    }

    throw error;
  }

  // The guide is read first: it seeds version 1 on first use.
  const guide = await getActiveVoiceGuide(brandId);
  const [versions, examples, preferences, settings] = await Promise.all([
    listVoiceGuideVersions(brandId),
    listVoiceExamples(brandId),
    listVoicePreferences(brandId),
    getBrandSettings(brandId),
  ]);
  const snapshot: BrandVoiceSnapshot = {
    guide,
    versions,
    examples,
    preferences,
    timezone: settings?.timezone ?? "UTC",
  };

  return NextResponse.json(snapshot, { headers: NO_STORE });
}
