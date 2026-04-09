#!/usr/bin/env node

const [major, minor] = process.versions.node.split(".").map(Number);

if (major < 22 || (major === 22 && minor < 6)) {
  console.error(
    `\n  ⚠ autoskills requires Node.js >= 22.6.0 for native TypeScript support.` +
      `\n  Current version: ${process.version}` +
      `\n  Please upgrade → https://nodejs.org\n`,
  );
  process.exit(1);
}

try {
  await import("./main.ts");
} catch (err) {
  if (err.code === "ERR_UNKNOWN_FILE_EXTENSION") {
    const { spawn } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const mainPath = fileURLToPath(new URL("./main.ts", import.meta.url));
    const child = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        "--disable-warning=ExperimentalWarning",
        mainPath,
        ...process.argv.slice(2),
      ],
      { stdio: "inherit" },
    );
    child.on("exit", (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      else process.exit(code ?? 1);
    });
  } else {
    throw err;
  }
}
