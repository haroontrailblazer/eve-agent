import { describe, expect, it } from "vitest";
import { MY_SKILLS_MAX, mySkillEntries } from "@/lib/skills/dynamic";

function skill(slug: string, extra: Partial<Parameters<typeof mySkillEntries>[0][number]> = {}) {
  return { slug, name: `Skill ${slug}`, description: "Does a thing.", prompt: "Do it.", enabled: true, ...extra };
}

describe("mySkillEntries", () => {
  it("names a skill my-<slug> and uses its prompt as markdown", () => {
    expect(mySkillEntries([skill("hooks")])).toEqual([
      { name: "my-hooks", description: "Does a thing.", markdown: "Do it." },
    ]);
  });

  it("skips disabled skills and empty prompts", () => {
    expect(mySkillEntries([skill("a", { enabled: false }), skill("b", { prompt: "  " }), skill("c")]).map((e) => e.name)).toEqual([
      "my-c",
    ]);
  });

  it("skips slugs that make an invalid name", () => {
    expect(mySkillEntries([skill("bad slug"), skill("x".repeat(70)), skill("ok")]).map((e) => e.name)).toEqual(["my-ok"]);
  });

  it("returns at most 20 entries, first by slug order", () => {
    const skills = Array.from({ length: 30 }, (_, i) => skill(`s${String(29 - i).padStart(2, "0")}`));
    const entries = mySkillEntries(skills);
    expect(entries).toHaveLength(MY_SKILLS_MAX);
    expect(entries[0]?.name).toBe("my-s00");
    expect(entries[19]?.name).toBe("my-s19");
  });

  it("falls back when the description is empty", () => {
    expect(mySkillEntries([skill("a", { description: "" })])[0]?.description).toBe("The owner's Skill a skill.");
  });
});
