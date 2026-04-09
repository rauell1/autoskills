import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert/strict";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { useTmpDir, writeFile } from "./helpers.ts";
import { shouldGenerateClaudeMd, summarizeMarkdown, generateClaudeMd } from "../claude.ts";

describe("shouldGenerateClaudeMd", () => {
  it("returns true when claude-code is selected", () => {
    strictEqual(shouldGenerateClaudeMd(["universal", "claude-code"]), true);
  });

  it("returns false when claude-code is not selected", () => {
    strictEqual(shouldGenerateClaudeMd(["universal", "cursor"]), false);
  });
});

describe("summarizeMarkdown", () => {
  it("extracts the first heading and paragraph", () => {
    const result = summarizeMarkdown(
      `# React Skill\n\nBest practices for building React apps with this stack.\n\n## Details\nMore text.\n`,
    );
    strictEqual(result.title, "React Skill");
    strictEqual(result.summary, "Best practices for building React apps with this stack.");
  });

  it("ignores code fences before the summary", () => {
    const result = summarizeMarkdown(
      `# Example\n\n\`\`\`js\nconsole.log("test")\n\`\`\`\n\nUse this skill to guide API integrations.\n`,
    );
    strictEqual(result.title, "Example");
    strictEqual(result.summary, "Use this skill to guide API integrations.");
  });

  it("strips YAML frontmatter and uses its description as summary", () => {
    const result = summarizeMarkdown(
      `---\nname: seo\ndescription: Optimize for search engine visibility and ranking.\nlicense: MIT\n---\n\n# SEO optimization\n\nSearch engine optimization based on Lighthouse SEO audits.\n`,
    );
    strictEqual(result.title, "SEO optimization");
    strictEqual(result.summary, "Optimize for search engine visibility and ranking.");
  });

  it("uses frontmatter name as title fallback when no heading exists", () => {
    const result = summarizeMarkdown(
      `---\nname: my-skill\ndescription: A useful skill.\n---\n\nSome paragraph text without a heading.\n`,
    );
    strictEqual(result.title, "my-skill");
    strictEqual(result.summary, "A useful skill.");
  });

  it("extracts heading from body when frontmatter has no description", () => {
    const result = summarizeMarkdown(
      `---\nname: react\n---\n\n# React Patterns\n\nKeep your components composable.\n`,
    );
    strictEqual(result.title, "React Patterns");
    strictEqual(result.summary, "Keep your components composable.");
  });
});

function addSkillFile(tmpPath: string): void {
  writeFile(
    tmpPath,
    ".claude/skills/react-best-practices/SKILL.md",
    `# React Best Practices\n\nUse this skill to keep components small and predictable.\n`,
  );
}

describe("generateClaudeMd", () => {
  const tmp = useTmpDir();

  it("returns generated=false when .claude/skills does not exist", () => {
    strictEqual(generateClaudeMd(tmp.path).generated, false);
  });

  it("creates CLAUDE.md with delimited section when file does not exist", () => {
    addSkillFile(tmp.path);
    const result = generateClaudeMd(tmp.path);
    const output = readFileSync(join(tmp.path, "CLAUDE.md"), "utf-8");
    strictEqual(result.generated, true);
    strictEqual(result.files, 1);
    ok(output.includes("# CLAUDE.md"));
    ok(output.includes("<!-- autoskills:start -->"));
    ok(output.includes("<!-- autoskills:end -->"));
    ok(output.includes("## React Best Practices"));
    ok(output.includes("`.claude/skills/react-best-practices/SKILL.md`"));
  });

  it("preserves user content and replaces only the delimited section", () => {
    const userContent =
      "# CLAUDE.md\n\nMy custom instructions for this project.\n\n<!-- autoskills:start -->\nold generated content here\n<!-- autoskills:end -->\n\n## My notes\n\nDo not touch this.\n";
    writeFileSync(join(tmp.path, "CLAUDE.md"), userContent);
    addSkillFile(tmp.path);
    generateClaudeMd(tmp.path);
    const output = readFileSync(join(tmp.path, "CLAUDE.md"), "utf-8");
    ok(output.includes("My custom instructions for this project."));
    ok(output.includes("Do not touch this."));
    ok(output.includes("## React Best Practices"));
    ok(!output.includes("old generated content here"));
  });

  it("appends delimited section when CLAUDE.md exists without markers", () => {
    writeFileSync(
      join(tmp.path, "CLAUDE.md"),
      "# CLAUDE.md\n\nAlways use TypeScript strict mode.\n",
    );
    addSkillFile(tmp.path);
    generateClaudeMd(tmp.path);
    const output = readFileSync(join(tmp.path, "CLAUDE.md"), "utf-8");
    ok(output.startsWith("# CLAUDE.md\n\nAlways use TypeScript strict mode."));
    ok(output.includes("<!-- autoskills:start -->"));
    ok(output.includes("## React Best Practices"));
  });

  it("updates the section when skills change", () => {
    addSkillFile(tmp.path);
    generateClaudeMd(tmp.path);
    writeFile(
      tmp.path,
      ".claude/skills/vue-patterns/SKILL.md",
      `# Vue Patterns\n\nComposition API best practices.\n`,
    );
    generateClaudeMd(tmp.path);
    const output = readFileSync(join(tmp.path, "CLAUDE.md"), "utf-8");
    ok(output.includes("## React Best Practices"));
    ok(output.includes("## Vue Patterns"));
    strictEqual(output.split("<!-- autoskills:start -->").length - 1, 1);
  });

  it("uses frontmatter description and groups references under skill heading", () => {
    writeFile(
      tmp.path,
      ".claude/skills/a11y/SKILL.md",
      `---\nname: accessibility\ndescription: Audit and improve web accessibility following WCAG 2.2 guidelines.\n---\n\n# Accessibility (a11y)\n\nComprehensive accessibility guidelines.\n`,
    );
    writeFile(
      tmp.path,
      ".claude/skills/a11y/references/PATTERNS.md",
      `# A11Y Patterns\n\nPractical patterns for common accessibility requirements.\n`,
    );
    generateClaudeMd(tmp.path);
    const output = readFileSync(join(tmp.path, "CLAUDE.md"), "utf-8");
    ok(output.includes("## Accessibility (a11y)"));
    ok(output.includes("Audit and improve web accessibility following WCAG 2.2 guidelines."));
    ok(output.includes("`.claude/skills/a11y/references/PATTERNS.md`"));
  });

  it("follows symlinked skill directories", () => {
    const realDir = join(tmp.path, ".agents", "skills", "react-basics");
    writeFile(
      tmp.path,
      ".agents/skills/react-basics/SKILL.md",
      `# React Basics\n\nKeep components small and composable.\n`,
    );
    const skillsDir = join(tmp.path, ".claude", "skills");
    mkdirSync(skillsDir, { recursive: true });
    symlinkSync(realDir, join(skillsDir, "react-basics"));
    const result = generateClaudeMd(tmp.path);
    const output = readFileSync(join(tmp.path, "CLAUDE.md"), "utf-8");
    strictEqual(result.generated, true);
    ok(output.includes("## React Basics"));
    ok(output.includes("Keep components small and composable."));
  });
});
