import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { loadYaml } from "eve/evals/loaders";
import { draftRequestMessage, draftsFromToolCalls, hardIssues, type EvalIdea } from "./shared";

const doc = await loadYaml("evals/data/ideas.yaml");
const rows = doc.ideas as readonly EvalIdea[];

export default rows.map((row) =>
  defineEval({
    description: row.id,
    async test(t) {
      const turn = await t.send(draftRequestMessage(row));
      t.succeeded();
      t.calledTool("draft_posts", { count: (n) => n >= 1 });

      const drafts = draftsFromToolCalls(turn.toolCalls);
      t.check(drafts.map((d) => d.platform).sort(), equals([...row.platforms].sort()));

      for (const draft of drafts) {
        t.check(hardIssues(draft, row.allowLinks ?? false), equals([])).label(`${draft.platform} lint`);
      }

      t.judge(
        "Every draft opens with a specific, concrete hook that makes the next line worth reading, sounds like a real person rather than generic AI copy, and matches its platform (short and punchy on X, structured with short paragraphs on LinkedIn, conversational on Threads).",
        { on: JSON.stringify(drafts, null, 2) },
      ).atLeast(0.7);
    },
  }),
);
