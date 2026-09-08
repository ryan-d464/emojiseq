import { test } from "node:test";
import assert from "node:assert/strict";
import { compileFile, lexLine, CompileError } from "./compiler.js";

// --- lexer ---

test("lexLine tokenizes a full statement", () => {
  const tokens = lexLine("family = :man: + :zwj: + :woman:", 1);
  assert.deepEqual(
    tokens.map((t) => t.type),
    ["ident", "equals", "shortcode", "plus", "shortcode", "plus", "shortcode"],
  );
  assert.equal(tokens[0].value, "family");
  assert.equal(tokens[2].value, ":man:");
});

test("lexLine records 1-based line and column", () => {
  const tokens = lexLine("  x = :man:", 7);
  assert.equal(tokens[0].line, 7);
  assert.equal(tokens[0].column, 3);
});

test("lexLine reads a shortcode with a skin tone modifier as one token", () => {
  const tokens = lexLine(":man:medium-dark:", 1);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].type, "shortcode");
  assert.equal(tokens[0].value, ":man:medium-dark:");
});

test("lexLine reads a flag shortcode with a country code as one token", () => {
  const tokens = lexLine(":flag:jp:", 1);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].value, ":flag:jp:");
});

test("lexLine throws on an unterminated shortcode", () => {
  assert.throws(
    () => lexLine("x = :man", 1),
    (err: unknown) =>
      err instanceof CompileError &&
      /unterminated shortcode/.test(err.message),
  );
});

test("lexLine throws on an unexpected character", () => {
  assert.throws(
    () => lexLine("x = :man: & :woman:", 1),
    (err: unknown) =>
      err instanceof CompileError && /unexpected character '&'/.test(err.message),
  );
});

// --- parser / compiler happy paths ---

test("compileFile joins shortcodes into a ZWJ sequence", () => {
  const { results, errors } = compileFile(
    "family = :man: + :zwj: + :woman: + :zwj: + :girl:",
    "test.emj",
  );
  assert.equal(errors.length, 0);
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "family");
  assert.equal(
    results[0].emoji,
    "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}",
  );
});

test("compileFile skips blank lines and comments", () => {
  const source = [
    "# a family",
    "",
    "family = :man: + :zwj: + :woman:  # inline comment",
    "   ",
  ].join("\n");
  const { results, errors } = compileFile(source, "test.emj");
  assert.equal(errors.length, 0);
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "family");
});

test("compileFile applies a skin tone modifier to a human shortcode", () => {
  const { results, errors } = compileFile("wave = :man:medium-dark:", "test.emj");
  assert.equal(errors.length, 0);
  assert.equal(results[0].emoji, "\u{1F468}\u{1F3FE}");
});

test("compileFile builds a flag from a two-letter country code", () => {
  const { results, errors } = compileFile("us = :flag:us:", "test.emj");
  assert.equal(errors.length, 0);
  assert.equal(results[0].emoji, "\u{1F1FA}\u{1F1F8}");
});

test("compileFile allows the same name to be reused across separate calls", () => {
  const { results: first } = compileFile("x = :man:", "a.emj");
  const { results: second } = compileFile("x = :woman:", "b.emj");
  assert.equal(first[0].emoji, "\u{1F468}");
  assert.equal(second[0].emoji, "\u{1F469}");
});

// --- diagnostics ---

test("compileFile reports an unknown shortcode with a did-you-mean hint", () => {
  const { results, errors } = compileFile("gift = :heart: + :zwj: + :hert:", "gift.emj");
  assert.equal(results.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /unknown shortcode ':hert:'/);
  assert.equal(errors[0].hint, "did you mean ':heart:'?");
  assert.equal(errors[0].line, 1);
  assert.equal(errors[0].column, 26);
});

test("compileFile reports a duplicate name pointing at the earlier definition", () => {
  const source = ["x = :man:", "x = :woman:"].join("\n");
  const { errors } = compileFile(source, "test.emj");
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /already defined on line 1/);
  assert.equal(errors[0].line, 2);
});

test("compileFile reports a missing '='", () => {
  const { errors } = compileFile("x :man:", "test.emj");
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /expected '='/);
});

test("compileFile reports a missing shortcode after '='", () => {
  const { errors } = compileFile("x =", "test.emj");
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /expected at least one shortcode/);
});

test("compileFile reports a trailing '+' with nothing after it", () => {
  const { errors } = compileFile("x = :man: +", "test.emj");
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /expected a shortcode after the trailing '\+'/);
});

test("compileFile reports two shortcodes glued together without a '+'", () => {
  const { errors } = compileFile("x = :man: :woman:", "test.emj");
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /expected '\+' between shortcodes/);
});

test("compileFile rejects a skin tone modifier on a non-human shortcode", () => {
  const { errors } = compileFile("x = :heart:medium:", "test.emj");
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /does not take a skin tone modifier/);
});

test("compileFile reports an unknown skin tone modifier with valid options", () => {
  const { errors } = compileFile("x = :man:sunburnt:", "test.emj");
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /unknown skin tone modifier 'sunburnt'/);
  assert.match(errors[0].hint ?? "", /light, medium-light, medium, medium-dark, dark/);
});

test("compileFile reports a flag code that isn't two letters", () => {
  const { errors } = compileFile("x = :flag:usa:", "test.emj");
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /is not a two-letter country code/);
});

test("compileFile reports a flag shortcode with no country code", () => {
  const { errors } = compileFile("x = :flag:", "test.emj");
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /expected a two-letter country code/);
});

test("compileFile keeps compiling later lines after an error", () => {
  const source = ["bad = :nope:", "good = :man:"].join("\n");
  const { results, errors } = compileFile(source, "test.emj");
  assert.equal(errors.length, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "good");
});

test("CompileError.formatDiagnostic points a caret at the offending span", () => {
  const { errors } = compileFile("gift = :heart: + :zwj: + :hert:", "gift.emj");
  const out = errors[0].formatDiagnostic("gift.emj");
  assert.match(out, /error: unknown shortcode ':hert:'/);
  assert.match(out, /--> gift\.emj:1:26/);
  assert.match(out, /\^{6}/);
  assert.match(out, /did you mean ':heart:'\?/);
});
