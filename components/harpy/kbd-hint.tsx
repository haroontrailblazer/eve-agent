import { Kbd, KbdGroup } from "@/components/ui/kbd";

export function KbdHint({ keys }: { readonly keys: readonly string[] }) {
  return (
    <KbdGroup>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
}
