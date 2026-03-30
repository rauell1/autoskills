import { spawn } from "node:child_process";
import { parseSkillPath } from "./lib.mjs";
import { dim, green, cyan, red, HIDE_CURSOR, SHOW_CURSOR, SPINNER } from "./colors.mjs";

export function getNpxCommand(platform = process.platform) {
  return platform === "win32" ? "npx.cmd" : "npx";
}

export function installSkill(skillPath) {
  const { repo, skillName } = parseSkillPath(skillPath);
  const args = ["-y", "skills", "add", repo];
  if (skillName) args.push("--skill", skillName);
  args.push("-y");
  return new Promise((resolve) => {
    const child = spawn(getNpxCommand(), args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    child.stdout?.on("data", (d) => {
      output += d.toString();
    });
    child.stderr?.on("data", (d) => {
      output += d.toString();
    });

    child.on("close", (code) => {
      resolve({ success: code === 0, output });
    });

    child.on("error", (err) => {
      resolve({ success: false, output: err.message });
    });
  });
}

/**
 * Parallel installer with animated spinners and live status.
 * Falls back to sequential output for non-TTY environments.
 */
export async function installAll(skills) {
  if (!process.stdout.isTTY) return installAllSimple(skills);

  const CONCURRENCY = 3;
  const total = skills.length;

  const states = skills.map(({ skill }) => ({
    name: skill,
    skill,
    status: "pending",
    output: "",
  }));

  let frame = 0;
  let rendered = false;

  function render() {
    if (rendered) {
      process.stdout.write(`\x1b[${total}A\r`);
    }
    rendered = true;
    process.stdout.write("\x1b[J");

    for (const state of states) {
      switch (state.status) {
        case "pending":
          process.stdout.write(dim(`   ◌ ${state.name}`) + "\n");
          break;
        case "installing":
          process.stdout.write(cyan(`   ${SPINNER[frame]}`) + ` ${state.name}...\n`);
          break;
        case "success":
          process.stdout.write(green(`   ✔ ${state.name}`) + "\n");
          break;
        case "failed":
          process.stdout.write(red(`   ✘ ${state.name}`) + dim(" — failed") + "\n");
          break;
      }
    }
  }

  process.stdout.write(HIDE_CURSOR);

  const timer = setInterval(() => {
    frame = (frame + 1) % SPINNER.length;
    if (states.some((s) => s.status === "installing")) render();
  }, 80);

  let installed = 0;
  let failed = 0;
  const errors = [];
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < total) {
      const idx = nextIdx++;
      const state = states[idx];
      state.status = "installing";
      render();

      const result = await installSkill(state.skill);

      if (result.success) {
        state.status = "success";
        installed++;
      } else {
        state.status = "failed";
        state.output = result.output;
        errors.push({ name: state.name, output: result.output });
        failed++;
      }
      render();
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker());
  await Promise.all(workers);

  clearInterval(timer);
  render();
  process.stdout.write(SHOW_CURSOR);

  return { installed, failed, errors };
}

async function installAllSimple(skills) {
  let installed = 0;
  let failed = 0;
  const errors = [];

  for (const { skill } of skills) {
    const result = await installSkill(skill);

    if (result.success) {
      console.log(green(`   ✔ ${skill}`));
      installed++;
    } else {
      console.log(red(`   ✘ ${skill}`) + dim(" — failed"));
      errors.push({ name: skill, output: result.output });
      failed++;
    }
  }

  return { installed, failed, errors };
}
