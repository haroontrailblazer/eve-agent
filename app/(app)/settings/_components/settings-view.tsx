"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { deleteSkillAction, listSkillsAction } from "@/app/actions/skills";
import { setBrandTimezoneAction } from "@/app/actions/studio";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { ConfirmActionButton } from "@/components/harpy/confirm-action-button";
import { showRequestError } from "@/components/harpy/show-request-error";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { authClient } from "@/lib/auth-client";
import type { SkillSummary } from "@/lib/skills/catalog";
import { parseThemePreference, type ThemePreference } from "@/lib/theme";

export function SettingsView() {
  return (
    <>
      <Section title="Account">
        <AccountCard />
      </Section>
      <Section title="Appearance">
        <AppearanceToggle />
      </Section>
      <Section title="Time zone">
        <TimeZoneRow />
      </Section>
      <Section title="Skills">
        <SkillsList />
      </Section>
    </>
  );
}

function Section({ children, title }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-heading text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function AccountCard() {
  const { requestSignIn, viewer } = useChatShell();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  if (!viewer) {
    return (
      <Card className="flex-row items-center justify-between gap-3 p-4">
        <p className="text-small text-muted-foreground">Sign in to manage your account.</p>
        <Button onClick={() => requestSignIn()} size="sm" type="button">
          Sign in
        </Button>
      </Card>
    );
  }

  function signOut() {
    if (signingOut) return;

    setSigningOut(true);
    const toastId = toast.loading("Signing out...");

    void authClient
      .signOut()
      .then(() => {
        toast.dismiss(toastId);
        router.replace("/");
        router.refresh();
      })
      .catch(() => {
        toast.error("Could not sign out", { id: toastId });
        setSigningOut(false);
      });
  }

  return (
    <Card className="flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-12">
          {viewer.image ? <AvatarImage alt="" src={viewer.image} /> : null}
          <AvatarFallback>{viewer.name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-body font-medium text-foreground">{viewer.name}</p>
          <p className="truncate text-small text-muted-foreground">{viewer.email}</p>
          <code className="block max-w-full truncate font-mono text-meta text-muted-foreground">
            {viewer.id}
          </code>
        </div>
      </div>
      <Button disabled={signingOut} onClick={signOut} type="button" variant="outline">
        <LogOutIcon />
        Sign out
      </Button>
    </Card>
  );
}

const APPEARANCE_OPTIONS: readonly { readonly value: ThemePreference; readonly label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function AppearanceToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <ToggleGroup
      aria-label="Theme"
      className="w-fit"
      onValueChange={(value) => {
        // An empty value means the active item was clicked again; keep it.
        if (value) setPreference(parseThemePreference(value));
      }}
      type="single"
      value={preference}
      variant="outline"
    >
      {APPEARANCE_OPTIONS.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function TimeZoneRow() {
  const { viewer } = useChatShell();
  const viewerId = viewer?.id ?? null;
  const [timezone, setTimezone] = useState<string | null>(null);
  const [zones] = useState<readonly string[]>(() => Intl.supportedValuesOf("timeZone"));

  useEffect(() => {
    if (!viewerId) return;

    let cancelled = false;

    void fetch("/api/brand-voice", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;

        const body = (await response.json()) as { timezone?: string };
        if (!cancelled && body.timezone) setTimezone(body.timezone);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [viewerId]);

  async function change(next: string) {
    const previous = timezone;
    setTimezone(next);

    try {
      const result = await setBrandTimezoneAction({ timezone: next });

      if (result.ok) {
        toast.success("Time zone saved");
        return;
      }

      showRequestError(result.message ?? "That time zone is not valid.");
    } catch {
      showRequestError("Something went wrong.");
    }

    setTimezone(previous);
  }

  const options = timezone !== null && !zones.includes(timezone) ? [timezone, ...zones] : zones;

  return (
    <Card className="flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <label className="text-small font-medium text-foreground" htmlFor="brand-timezone">
        Scheduled posts use this time zone
      </label>
      <select
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-small shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 sm:w-64 dark:bg-input/30"
        disabled={timezone === null}
        id="brand-timezone"
        onChange={(event) => void change(event.target.value)}
        value={timezone ?? ""}
      >
        {timezone === null ? <option value="">Loading...</option> : null}
        {options.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </select>
    </Card>
  );
}

function SkillsList() {
  const { viewer } = useChatShell();
  const viewerId = viewer?.id ?? null;
  const [skills, setSkills] = useState<readonly SkillSummary[] | null>(null);

  const load = useCallback(async () => {
    setSkills(await listSkillsAction());
  }, []);

  useEffect(() => {
    let cancelled = false;

    void listSkillsAction().then((next) => {
      if (!cancelled) setSkills(next);
    });

    return () => {
      cancelled = true;
    };
  }, [viewerId]);

  if (skills === null) {
    return <Skeleton className="h-24 w-full" />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {skills.map((skill) => (
        <li key={skill.slug}>
          <Card className="flex-row items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-small font-medium text-foreground">{skill.name}</p>
                <code className="font-mono text-meta text-muted-foreground">/{skill.slug}</code>
                <Badge variant="secondary">{skill.source === "custom" ? "custom" : "built-in"}</Badge>
              </div>
              {skill.description ? (
                <p className="mt-0.5 text-meta text-muted-foreground">{skill.description}</p>
              ) : null}
            </div>
            {skill.source === "custom" ? (
              <ConfirmActionButton
                confirmBody="This removes the skill from your slash menu. You can install it again from chat."
                confirmLabel="Delete"
                confirmTitle={`Delete ${skill.name}?`}
                label="Delete"
                onConfirm={async () => {
                  const result = await deleteSkillAction(skill.slug);

                  if (!result.ok) {
                    throw new Error(`Could not delete ${skill.name}.`);
                  }

                  await load();
                }}
                pendingLabel="Deleting..."
              />
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}
