# emojiseq

Emoji ZWJ sequences are just Unicode codepoints joined with an invisible
zero-width joiner, which means it is very easy to get one wrong and never
notice: a missing joiner, a typo'd shortcode, a stray character copy-pasted
from somewhere. The result either renders as separate emoji next to each
other or silently falls back to a default glyph, and there is nothing in
the raw codepoints that tells you what went wrong.

emojiseq compiles a small, readable source format into the actual emoji
sequence, and if something is wrong it tells you exactly where, the way a
compiler would.

## Usage

Write a `.emj` file:

```
# family.emj
family = :man: + :zwj: + :woman: + :zwj: + :girl: + :zwj: + :boy:
couple = :woman: + :zwj: + :heart: + :zwj: + :kiss: + :zwj: + :man:
```

Compile it:

```
$ emojiseq family.emj
family = 👨‍👩‍👧‍👦
couple = 👩‍❤️‍💋‍👨
```

If a shortcode is misspelled, the error points at the exact column and
offers a correction:

```
$ cat gift.emj
gift = :heart: + :zwj: + :hert:

$ emojiseq gift.emj
error: unknown shortcode ':hert:'
  --> gift.emj:1:26
  |
1 | gift = :heart: + :zwj: + :hert:
  |                          ^^^^^^
  = did you mean ':heart:'?

1 error
```

By default the compiled sequences print to stdout. Use `--out` to write
them to a file instead:

```
$ emojiseq family.emj --out family.txt
```

## Source format

One statement per line:

```
name = :shortcode: + :shortcode: + ...
```

- Blank lines are ignored.
- `#` starts a comment that runs to the end of the line.
- A name may only be defined once per file.
- The set of known shortcodes lives in `src/compiler.ts` as `EMOJI_TABLE`.
  It covers common human figures, several fantasy figures, and a grab bag
  of objects and nature glyphs, but it is still hand-maintained rather
  than generated from Unicode's data files (see Roadmap).

Shortcodes for human figures, plus fantasy figures that have a
Fitzpatrick tone in the Unicode data (`:elf:`, `:vampire:`, `:mage:`,
and similar, but not `:genie:` or `:zombie:`, which are always their
own color), accept a skin tone modifier right after the name, sharing
the middle colon:

```
wave = :man:medium-dark: + :zwj: + :kiss:
```

Valid modifiers are `light`, `medium-light`, `medium`, `medium-dark`,
and `dark`. Applying one to a non-human shortcode, or misspelling the
modifier, is a compile error with the same line/column reporting as
everything else.

Flags are built from pairs of regional indicator symbols rather than
hand-listed, so any ISO 3166-1 alpha-2 country code works with the
`:flag:` shortcode:

```
trip = :flag:jp: + :zwj: + :heart: + :zwj: + :flag:us:
```

A code that isn't two letters is a compile error at the same column.

## Building

```
npm run build
```

This runs `tsc` against `src/` and writes plain JavaScript to `dist/`.
There are no runtime dependencies.

## Testing

```
npm test
```

This builds the project and runs the test suite with Node's built-in
test runner (`node --test`), no test framework required. Tests live
alongside the source in `src/compiler.test.ts` and cover the lexer,
the statement parser, and the diagnostic messages, including their
line/column pointers and did-you-mean hints.

## Roadmap

- Generate the shortcode table from Unicode's `emoji-zwj-sequences.txt`
  instead of hand-writing it
