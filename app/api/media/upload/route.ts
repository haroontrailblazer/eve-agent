import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/media/limits";
import { getServerViewer } from "@/lib/session";

// Issues client tokens so the browser can upload chat images straight to Blob,
// past the 4.5 MB request body limit. The browser records each finished upload
// with recordUploadedMediaAction, so no upload-completed webhook is needed and
// localhost works too.

class UploadRefusedError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadRefusedError";
    this.status = status;
  }
}

export async function POST(request: Request) {
  let body: HandleUploadBody;

  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // getServerViewer already checks the email allowlist.
        const viewer = await getServerViewer();

        if (!viewer) {
          throw new UploadRefusedError("Sign in to upload images.", 401);
        }

        if (!pathname.startsWith("uploads/")) {
          throw new UploadRefusedError("Uploads must go under uploads/.", 400);
        }

        return {
          addRandomSuffix: true,
          allowedContentTypes: Object.keys(ALLOWED_IMAGE_TYPES),
          maximumSizeInBytes: MAX_IMAGE_BYTES,
        };
      },
      onUploadCompleted: async () => {
        // Recording happens through recordUploadedMediaAction.
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof UploadRefusedError ? error.status : 400;
    const message = error instanceof Error ? error.message : "Upload failed.";

    return NextResponse.json({ error: message }, { status });
  }
}
