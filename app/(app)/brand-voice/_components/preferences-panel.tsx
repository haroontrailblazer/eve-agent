import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { addVoicePreferenceAction, deleteVoicePreferenceAction } from "@/app/actions/voice";
import { showRequestError } from "@/components/harpy/show-request-error";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { VoicePreference } from "@/lib/voice/store";
import { STUDIO_ACTION_FAILED_MESSAGE } from "../../_components/studio/use-studio-snapshot";

// Short rules harpy always follows, added here or saved from chat.
export function PreferencesPanel({
  preferences,
  refresh,
}: {
  readonly preferences: readonly VoicePreference[];
  readonly refresh: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function add() {
    if (adding || text.trim() === "") return;
    setAdding(true);

    try {
      const result = await addVoicePreferenceAction({ text });

      if (result.ok) {
        setText("");
      } else {
        showRequestError(result.message);
      }
    } catch {
      showRequestError(STUDIO_ACTION_FAILED_MESSAGE);
    } finally {
      await refresh();
      setAdding(false);
    }
  }

  async function remove(id: string) {
    if (deletingId) return;
    setDeletingId(id);

    try {
      const result = await deleteVoicePreferenceAction({ id });

      if (!result.ok) showRequestError("Could not delete that preference.");
    } catch {
      showRequestError(STUDIO_ACTION_FAILED_MESSAGE);
    } finally {
      await refresh();
      setDeletingId(null);
    }
  }

  return (
    <Card className="gap-4 p-4">
      <h2 className="text-heading text-foreground">Preferences</h2>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Input
          aria-label="Preference"
          disabled={adding}
          onChange={(event) => setText(event.target.value)}
          placeholder="For example: never use hashtags on LinkedIn"
          value={text}
        />
        <Button disabled={adding || text.trim() === ""} size="sm" type="submit">
          Add
        </Button>
      </form>
      {preferences.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {preferences.map((preference) => (
            <li className="flex items-center gap-3 rounded-md border border-border p-3" key={preference.id}>
              <div className="min-w-0 flex-1">
                <p className="text-small text-foreground">{preference.text}</p>
                {preference.source === "chat" ? (
                  <p className="text-meta text-muted-foreground">from chat</p>
                ) : null}
              </div>
              <Button
                aria-label="Delete preference"
                disabled={deletingId !== null}
                onClick={() => void remove(preference.id)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
