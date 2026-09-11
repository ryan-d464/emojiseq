// Compiles .emj source into Unicode emoji sequences.
//
// Source format, one statement per line:
//
//   name = :shortcode: + :shortcode: + ...
//
// A shortcode for a human figure may carry a skin tone modifier right
// after its name, sharing the middle colon: :man:medium-dark:
//
// A flag is written as :flag: followed by an ISO 3166-1 alpha-2 country
// code sharing the middle colon, the same way skin tones work: :flag:us:
//
// Blank lines and lines starting with # are ignored. Everything after
// an unquoted # on a line is treated as a trailing comment.

export type TokenType = "ident" | "equals" | "plus" | "shortcode";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export interface Sequence {
  name: string;
  emoji: string;
}

// Codepoint for the regional indicator symbol 'A'. A flag is two of
// these back to back, one per letter of an ISO 3166-1 alpha-2 code:
// U+1F1FA U+1F1F8 ('U' + 'S') renders as the US flag.
const REGIONAL_INDICATOR_BASE = 0x1f1e6;

function regionalIndicatorFlag(code: string): string | undefined {
  if (!/^[A-Za-z]{2}$/.test(code)) return undefined;
  return Array.from(code.toUpperCase())
    .map((ch) =>
      String.fromCodePoint(REGIONAL_INDICATOR_BASE + ch.charCodeAt(0) - 65),
    )
    .join("");
}

// Generating this from Unicode's emoji-zwj-sequences.txt is still on the
// roadmap; for now every entry here has been checked by hand against the
// Unicode emoji data tables.
export const EMOJI_TABLE: Record<string, string> = {
  man: "\u{1F468}",
  woman: "\u{1F469}",
  girl: "\u{1F467}",
  boy: "\u{1F466}",
  baby: "\u{1F476}",
  older_man: "\u{1F474}",
  older_woman: "\u{1F475}",
  person: "\u{1F9D1}",
  older_person: "\u{1F9D3}",
  police_officer: "\u{1F46E}",
  construction_worker: "\u{1F477}",
  guard: "\u{1F482}",
  detective: "\u{1F575}",
  bride_with_veil: "\u{1F470}",
  man_in_tuxedo: "\u{1F935}",
  princess: "\u{1F478}",
  prince: "\u{1F934}",
  superhero: "\u{1F9B8}",
  supervillain: "\u{1F9B9}",
  mage: "\u{1F9D9}",
  fairy: "\u{1F9DA}",
  vampire: "\u{1F9DB}",
  merperson: "\u{1F9DC}",
  elf: "\u{1F9DD}",
  santa: "\u{1F385}",
  mrs_claus: "\u{1F936}",
  running: "\u{1F3C3}",
  walking: "\u{1F6B6}",
  raising_hand: "\u{1F64B}",
  bowing: "\u{1F647}",
  shrug: "\u{1F937}",
  facepalm: "\u{1F926}",
  genie: "\u{1F9DE}",
  zombie: "\u{1F9DF}",
  heart: "❤️",
  kiss: "\u{1F48B}",
  zwj: "‍",
  fire: "\u{1F525}",
  star: "⭐",
  sparkles: "✨",
  tada: "\u{1F389}",
  rainbow: "\u{1F308}",
  rocket: "\u{1F680}",
  sun: "☀️",
  moon: "\u{1F319}",
  cloud: "☁️",
  snowflake: "❄️",
  gift: "\u{1F381}",
  balloon: "\u{1F388}",
  trophy: "\u{1F3C6}",
  crown: "\u{1F451}",
  gem: "\u{1F48E}",
  key: "\u{1F511}",
  lock: "\u{1F512}",
  bulb: "\u{1F4A1}",
  bell: "\u{1F514}",
  book: "\u{1F4D6}",
  eyes: "\u{1F440}",
  thinking: "\u{1F914}",
};

// Fitzpatrick skin tone modifiers (Unicode emoji-modifiers.txt). Applied
// as a combining codepoint directly after the base glyph.
export const SKIN_TONE_TABLE: Record<string, string> = {
  light: "\u{1F3FB}",
  "medium-light": "\u{1F3FC}",
  medium: "\u{1F3FD}",
  "medium-dark": "\u{1F3FE}",
  dark: "\u{1F3FF}",
};

// Only human figures take a skin tone modifier; objects and joiners don't.
// Fantasy figures are a mixed bag in the Unicode data itself: elves and
// vampires take a tone, but genies and zombies are always their own
// color, so those two are deliberately left out of this set.
const MODIFIABLE_SHORTCODES = new Set([
  "man",
  "woman",
  "girl",
  "boy",
  "baby",
  "older_man",
  "older_woman",
  "person",
  "older_person",
  "police_officer",
  "construction_worker",
  "guard",
  "detective",
  "bride_with_veil",
  "man_in_tuxedo",
  "princess",
  "prince",
  "superhero",
  "supervillain",
  "mage",
  "fairy",
  "vampire",
  "merperson",
  "elf",
  "santa",
  "mrs_claus",
  "running",
  "walking",
  "raising_hand",
  "bowing",
  "shrug",
  "facepalm",
]);

export class CompileError extends Error {
  readonly line: number;
  readonly column: number;
  readonly sourceLine: string;
  readonly length: number;
  readonly hint: string | undefined;

  constructor(
    message: string,
    line: number,
    column: number,
    sourceLine: string,
    length = 1,
    hint?: string,
  ) {
    super(message);
    this.line = line;
    this.column = column;
    this.sourceLine = sourceLine;
    this.length = Math.max(1, length);
    this.hint = hint;
  }

  // Rust-style single diagnostic: source snippet plus a caret span
  // under the exact characters that are wrong.
  formatDiagnostic(filename: string): string {
    const gutter = " ".repeat(String(this.line).length);
    const pointer =
      " ".repeat(this.column - 1) + "^".repeat(this.length);
    let out = `error: ${this.message}\n`;
    out += `  --> ${filename}:${this.line}:${this.column}\n`;
    out += `${gutter} |\n`;
    out += `${this.line} | ${this.sourceLine}\n`;
    out += `${gutter} | ${pointer}\n`;
    if (this.hint) {
      out += `${gutter} = ${this.hint}\n`;
    }
    return out;
  }
}

function stripComment(line: string): string {
  const i = line.indexOf("#");
  return i === -1 ? line : line.slice(0, i);
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_-]/.test(ch);
}

export function lexLine(text: string, lineNumber: number): Token[] {
  const tokens: Token[] = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    const ch = text[i];

    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }

    const column = i + 1;

    if (ch === "=") {
      tokens.push({ type: "equals", value: "=", line: lineNumber, column });
      i++;
      continue;
    }

    if (ch === "+") {
      tokens.push({ type: "plus", value: "+", line: lineNumber, column });
      i++;
      continue;
    }

    if (ch === ":") {
      let j = i + 1;
      while (j < n && isIdentPart(text[j])) j++;
      if (j === i + 1 || text[j] !== ":") {
        throw new CompileError(
          'unterminated shortcode, expected a closing ":"',
          lineNumber,
          column,
          text,
          Math.max(1, j - i),
        );
      }

      // A skin tone modifier is written right after the name with no
      // space, sharing the middle colon: ":man:medium-dark:".
      let end = j + 1;
      if (end < n && isIdentStart(text[end])) {
        let k = end + 1;
        while (k < n && isIdentPart(text[k])) k++;
        if (k < n && text[k] === ":") {
          end = k + 1;
        }
      }

      const value = text.slice(i, end);
      tokens.push({ type: "shortcode", value, line: lineNumber, column });
      i = end;
      continue;
    }

    if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < n && isIdentPart(text[j])) j++;
      tokens.push({
        type: "ident",
        value: text.slice(i, j),
        line: lineNumber,
        column,
      });
      i = j;
      continue;
    }

    throw new CompileError(
      `unexpected character '${ch}'`,
      lineNumber,
      column,
      text,
      1,
    );
  }

  return tokens;
}

// Splits a shortcode token's text into its name and, if present, its
// skin tone modifier: ":man:medium-dark:" -> { name: "man", modifier: "medium-dark" }.
function splitShortcode(value: string): { name: string; modifier?: string } {
  const inner = value.slice(1, -1);
  const colon = inner.indexOf(":");
  if (colon === -1) return { name: inner };
  return { name: inner.slice(0, colon), modifier: inner.slice(colon + 1) };
}

// Plain Levenshtein distance, used to power "did you mean" hints.
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0),
  );
  for (let r = 0; r < rows; r++) d[r][0] = r;
  for (let c = 0; c < cols; c++) d[0][c] = c;
  for (let r = 1; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      const cost = a[r - 1] === b[c - 1] ? 0 : 1;
      d[r][c] = Math.min(
        d[r - 1][c] + 1,
        d[r][c - 1] + 1,
        d[r - 1][c - 1] + cost,
      );
    }
  }
  return d[rows - 1][cols - 1];
}

function suggestShortcode(name: string): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of [...Object.keys(EMOJI_TABLE), "flag"]) {
    const distance = editDistance(name, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best !== undefined && bestDistance <= 2 ? best : undefined;
}

function parseStatement(tokens: Token[], sourceLine: string): {
  name: string;
  nameToken: Token;
  parts: Token[];
} {
  if (tokens.length === 0 || tokens[0].type !== "ident") {
    const column = tokens[0]?.column ?? sourceLine.length + 1;
    throw new CompileError(
      "expected a sequence name at the start of the line",
      tokens[0]?.line ?? 0,
      column,
      sourceLine,
      1,
    );
  }
  const nameToken = tokens[0];

  const equals = tokens[1];
  if (!equals || equals.type !== "equals") {
    const after = nameToken.column + nameToken.value.length;
    throw new CompileError(
      `expected '=' after '${nameToken.value}'`,
      nameToken.line,
      after,
      sourceLine,
      1,
    );
  }

  const rest = tokens.slice(2);
  if (rest.length === 0) {
    throw new CompileError(
      "expected at least one shortcode after '='",
      equals.line,
      equals.column + 1,
      sourceLine,
      1,
    );
  }

  const parts: Token[] = [];
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    const expectShortcode = i % 2 === 0;
    if (expectShortcode) {
      if (token.type !== "shortcode") {
        throw new CompileError(
          `expected a shortcode like ':man:', found '${token.value}'`,
          token.line,
          token.column,
          sourceLine,
          token.value.length,
        );
      }
      parts.push(token);
    } else if (token.type !== "plus") {
      throw new CompileError(
        `expected '+' between shortcodes, found '${token.value}'`,
        token.line,
        token.column,
        sourceLine,
        token.value.length,
      );
    }
  }

  if (rest.length % 2 === 0) {
    const last = rest[rest.length - 1];
    throw new CompileError(
      "expected a shortcode after the trailing '+'",
      last.line,
      last.column + last.value.length,
      sourceLine,
      1,
    );
  }

  return { name: nameToken.value, nameToken, parts };
}

export function compileFile(
  source: string,
  filename: string,
): { results: Sequence[]; errors: CompileError[] } {
  const results: Sequence[] = [];
  const errors: CompileError[] = [];
  const seenNames = new Map<string, Token>();

  const lines = source.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineNumber = lineIndex + 1;
    const rawLine = lines[lineIndex];
    const withoutComment = stripComment(rawLine);
    if (withoutComment.trim().length === 0) continue;

    try {
      const tokens = lexLine(withoutComment, lineNumber);
      const { name, nameToken, parts } = parseStatement(tokens, rawLine);

      const previous = seenNames.get(name);
      if (previous) {
        throw new CompileError(
          `sequence '${name}' is already defined on line ${previous.line}`,
          nameToken.line,
          nameToken.column,
          rawLine,
          name.length,
        );
      }
      seenNames.set(name, nameToken);

      let emoji = "";
      for (const part of parts) {
        const { name: key, modifier } = splitShortcode(part.value);

        if (key === "flag") {
          if (modifier === undefined) {
            throw new CompileError(
              "expected a two-letter country code, e.g. ':flag:us:'",
              part.line,
              part.column,
              rawLine,
              part.value.length,
            );
          }
          const flagGlyph = regionalIndicatorFlag(modifier);
          if (flagGlyph === undefined) {
            throw new CompileError(
              `'${modifier}' is not a two-letter country code`,
              part.line,
              part.column,
              rawLine,
              part.value.length,
              "expected two letters, e.g. 'us' or 'jp'",
            );
          }
          emoji += flagGlyph;
          continue;
        }

        const glyph = EMOJI_TABLE[key];
        if (glyph === undefined) {
          const suggestion = suggestShortcode(key);
          throw new CompileError(
            `unknown shortcode ':${key}:'`,
            part.line,
            part.column,
            rawLine,
            part.value.length,
            suggestion ? `did you mean ':${suggestion}:'?` : undefined,
          );
        }

        if (modifier === undefined) {
          emoji += glyph;
          continue;
        }

        if (!MODIFIABLE_SHORTCODES.has(key)) {
          throw new CompileError(
            `':${key}:' does not take a skin tone modifier`,
            part.line,
            part.column,
            rawLine,
            part.value.length,
          );
        }

        const tone = SKIN_TONE_TABLE[modifier];
        if (tone === undefined) {
          throw new CompileError(
            `unknown skin tone modifier '${modifier}'`,
            part.line,
            part.column,
            rawLine,
            part.value.length,
            `expected one of: ${Object.keys(SKIN_TONE_TABLE).join(", ")}`,
          );
        }
        emoji += glyph + tone;
      }

      results.push({ name, emoji });
    } catch (err) {
      if (err instanceof CompileError) {
        errors.push(err);
      } else {
        throw err;
      }
    }
  }

  return { results, errors };
}
