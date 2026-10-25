import { ClapperboardIcon, GalleryHorizontalIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import type { CarouselOutlineBody, ReelScriptBody } from "@/lib/drafts/records";
import type { StudioPiece } from "@/lib/studio/types";

// A reel script or carousel outline. Pieces are never published, so the card
// has no review actions.
export function ContentPieceCard({ piece }: { readonly piece: StudioPiece }) {
  const isReel = piece.kind === "reel_script";
  const Icon = isReel ? ClapperboardIcon : GalleryHorizontalIcon;

  return (
    <Card className="gap-3 p-4 shadow-raised">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-muted px-2 text-meta font-medium text-foreground">
          <Icon aria-hidden="true" className="size-3" />
          {isReel ? "Reel script" : "Carousel"}
        </span>
      </div>
      {piece.title ? <p className="text-body font-medium text-foreground">{piece.title}</p> : null}
      {isReel ? (
        <ReelBody body={piece.body as ReelScriptBody} />
      ) : (
        <CarouselBody body={piece.body as CarouselOutlineBody} imageUrl={piece.imageUrl} />
      )}
    </Card>
  );
}

function ReelBody({ body }: { readonly body: ReelScriptBody }) {
  return (
    <>
      {body.hook ? <Field label="Hook">{body.hook}</Field> : null}
      <ol className="flex flex-col gap-3">
        {(body.beats ?? []).map((beat, index) => (
          // Beats have no ids and keep their order within a saved piece.
          <li className="flex gap-3" key={index}>
            <span className="w-5 shrink-0 text-small font-medium text-muted-foreground tabular-nums">
              {index + 1}.
            </span>
            <dl className="flex min-w-0 flex-1 flex-col gap-1">
              <Line label="Visual" value={beat.visual} />
              <Line label="Voiceover" value={beat.voiceover} />
              <Line label="On-screen text" value={beat.onScreenText} />
            </dl>
          </li>
        ))}
      </ol>
      {body.caption ? <Field label="Caption">{body.caption}</Field> : null}
    </>
  );
}

function CarouselBody({
  body,
  imageUrl,
}: {
  readonly body: CarouselOutlineBody;
  readonly imageUrl: string | null;
}) {
  return (
    <>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- cover images are hosted blobs of unknown size
        <img
          alt=""
          className="max-h-64 w-full rounded-md border border-border object-cover"
          src={imageUrl}
        />
      ) : null}
      <ol className="flex flex-col gap-3">
        {(body.slides ?? []).map((slide, index) => (
          <li className="flex gap-3" key={index}>
            <span className="w-5 shrink-0 text-small font-medium text-muted-foreground tabular-nums">
              {index + 1}.
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-small font-medium text-foreground">{slide.heading}</p>
              {slide.body ? (
                <p className="whitespace-pre-wrap text-small text-muted-foreground">{slide.body}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {body.caption ? <Field label="Caption">{body.caption}</Field> : null}
    </>
  );
}

function Field({ children, label }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-meta text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-body text-foreground">{children}</p>
    </div>
  );
}

function Line({ label, value }: { readonly label: string; readonly value: string }) {
  if (!value) return null;

  return (
    <div className="flex flex-col">
      <dt className="text-meta text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap text-small text-foreground">{value}</dd>
    </div>
  );
}
