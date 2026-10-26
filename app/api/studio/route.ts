import { NextResponse } from "next/server";
import { BrandAccessError, getBrandIdForUser } from "@/lib/brand-access";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";
import { loadStudioSnapshot } from "@/lib/studio/snapshot";

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

  return NextResponse.json(await loadStudioSnapshot(brandId, viewer.id), { headers: NO_STORE });
}
