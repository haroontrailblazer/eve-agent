import { Card } from "@/components/ui/card";

export function MetricTile({
  delta,
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
  readonly delta?: string;
}) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-meta text-muted-foreground">{label}</p>
      <p className="text-title text-foreground tabular-nums">{value}</p>
      {delta ? <p className="text-meta text-muted-foreground">{delta}</p> : null}
    </Card>
  );
}
