#!/usr/bin/env node
import { run } from "./cli.js";

run(
  process.argv.slice(2),
  process.env,
  { out: (s) => process.stdout.write(s + "\n"), err: (s) => process.stderr.write(s + "\n") },
)
  .then((code) => process.exit(code))
  .catch((e) => { process.stderr.write(`fatal: ${(e as Error)?.stack ?? String(e)}\n`); process.exit(1); });
