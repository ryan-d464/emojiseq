#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { compileFile } from "./compiler.js";

function main(argv: string[]): number {
  const file = argv[0];
  if (!file) {
    process.stderr.write("usage: emojiseq <file.emj>\n");
    return 1;
  }

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

  for (const result of results) {
    process.stdout.write(`${result.name} = ${result.emoji}\n`);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
