#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { compileFile } from "./compiler.js";

interface Args {
  file?: string;
  out?: string;
}

function parseArgs(argv: string[]): Args | undefined {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") {
      const value = argv[i + 1];
      if (value === undefined) return undefined;
      args.out = value;
      i++;
      continue;
    }
    if (arg.startsWith("--out=")) {
      args.out = arg.slice("--out=".length);
      continue;
    }
    if (args.file !== undefined) return undefined;
    args.file = arg;
  }
  return args;
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (!args || !args.file) {
    process.stderr.write("usage: emojiseq <file.emj> [--out <file>]\n");
    return 1;
  }
  const { file, out } = args;

  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`emojiseq: cannot read '${file}': ${message}\n`);
    return 1;
  }

  const { results, errors } = compileFile(source, file);

  if (errors.length > 0) {
    for (const error of errors) {
      process.stderr.write(error.formatDiagnostic(file));
    }
    process.stderr.write(
      `\n${errors.length} error${errors.length === 1 ? "" : "s"}\n`,
    );
    return 1;
  }

  const output = results.map((r) => `${r.name} = ${r.emoji}\n`).join("");

  if (out) {
    try {
      writeFileSync(out, output, "utf8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`emojiseq: cannot write '${out}': ${message}\n`);
      return 1;
    }
  } else {
    process.stdout.write(output);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
