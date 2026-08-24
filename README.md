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

## Source format

One statement per line:

```
name = :shortcode: + :shortcode: + ...
```

- Blank lines are ignored.
- `#` starts a comment that runs to the end of the line.
- A name may only be defined once per file.
- The set of known shortcodes lives in `src/compiler.ts` and is currently
  small on purpose (see Roadmap).

Shortcodes for human figures (`:man:`, `:woman:`, `:girl:`, `:boy:`,
`:baby:`, `:older_man:`, `:older_woman:`) accept a skin tone modifier
right after the name, sharing the middle colon:

```
wave = :man:medium-dark: + :zwj: + :kiss:
```

Valid modifiers are `light`, `medium-light`, `medium`, `medium-dark`,
and `dark`. Applying one to a non-human shortcode, or misspelling the
modifier, is a compile error with the same line/column reporting as
everything else.

## Building

```
npm run build
```

This runs `tsc` against `src/` and writes plain JavaScript to `dist/`.
There are no runtime dependencies.

## Roadmap

- Flag sequences built from regional indicator pairs
- Generate the shortcode table from Unicode's `emoji-zwj-sequences.txt`
  instead of hand-writing it
- `--out` flag to write compiled sequences to a file instead of stdout
- A test suite covering the lexer, parser, and diagnostics
