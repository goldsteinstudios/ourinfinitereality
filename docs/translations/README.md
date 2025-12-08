# Structural Translations

This folder contains the core translation work: treating the Dao De Jing as geometric notation rather than mystical poetry.

## Folder Structure

```
translations/
├── chapters/        # Individual chapter translations
├── lexicon/         # Structural lexicon (character algebra)
├── meta/            # Framework documents
├── archaeology/     # Guodian manuscript analysis
└── analysis/        # Integration tools
```

## Chapters (35 completed)

Each chapter file includes:
- **Original text** (Chinese)
- **Character-by-character decomposition** with radical analysis
- **Structural translation** (what the text documents, not what it "means")
- **Guodian validation** (where available from ~300 BCE manuscripts)
- **Cross-references** to related chapters

### File naming
`chapterXX_YYYY-MM-DD.md` (e.g., `chapter64_2025-11-26.md`)

### Chapters translated
1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 21, 22, 25, 34, 38, 39, 40, 41, 42, 46, 48, 51, 52, 56, 64, 65, 76, 78, 81

Plus specialized analyses:
- `chapter11_wheel_reread_2025-11-26.md` - Deep dive on void/function
- `chapter22_pi_operation_2025-11-26.md` - The π-operation discovery

## Lexicon (6 parts)

The structural lexicon documents characters as transformation equations:

| Part | Content |
|------|---------|
| 00 | Introduction - How to use this as an algebra manual |
| 01 | Substrate Families - What receives operations (禾, 氵, 心, 貝, 木, 土) |
| 02 | Operator Families - What transforms substrates (刂, 口, 反, 彳) |
| 03 | Structural Positions - The coordinate system (無/有, 可/常, 妙/徼, etc.) |
| 04 | Concept Index - Cross-reference by operational principle |
| 05 | Pinyin Index - Alphabetical lookup |

### Key insight
Characters are equations: `f(substrate, operator) → result`

Example: 利 = 禾 (grain) + 刂 (blade) = scythe operation (arc through field)

## Meta Documents

Framework and methodology files:

| File | Content |
|------|---------|
| `chapter25_rosetta_stone.md` | The key that unlocks the recursion formula |
| `scythe_not_knife_2025-11-27.md` | Critical correction: 利 = scythe, not knife |
| `radical_families_grain_blade_2025-11-27.md` | Complete mapping of 禾 and 刂 families |
| `framework_synthesis_2025-11-26.md` | Overall methodology |
| `corpus_status_2025-11-26.md` | Translation progress tracking |

## Archaeology

Guodian bamboo slip manuscript analysis (~300 BCE):

| File | Content |
|------|---------|
| `guodian_bundle_a_inventory.md` | Bundle A: Chapters 19, 66, 46, 30, 15, 64, 37, 63, 2, 32, 25, 5, 16, 56, 57, 55, 44, 40, 9 |
| `guodian_bundle_b_inventory.md` | Bundle B: Chapters 59, 48, 20, 13, 41, 52, 45, 54 |
| `guodian_bundle_c_inventory.md` | Bundle C: Chapters 17, 18, 31, 35, 64 |
| `guodian_cross_reference_report.md` | Which chapters are validated by manuscripts |
| `guodian_section_break_analysis.md` | Original text organization (tadpole markers) |
| `source_images/` | Bamboo slip photographs (A/B/C bundles) |

### Key Guodian findings
- Uses 恆 (héng) where later texts use 常 (cháng)
- Uses 亡 (wáng) where later texts use 無 (wú)
- Section breaks (■) show original organization differed from 81-chapter structure
- Chapters 15-64-56 flow together without breaks

## Translation Principles

### What we do
- Document what the text **encodes** (geometric operations)
- Validate against earliest manuscripts
- Treat characters as structural equations
- Map radical families systematically

### What we avoid
- Moral interpretation ("you should...")
- Mystical vagueness ("the ineffable...")
- Anachronistic concepts (quantum mechanics, etc.)
- Prescriptive reading (the text describes, it doesn't prescribe)

### The filtering test
Every translation should pass: "This is what happens when X" not "You should do X"

## Core Formulas

| Chapter | Formula | What it encodes |
|---------|---------|-----------------|
| 1 | 道可道非常道 | Frame-dependent vs frame-independent pattern |
| 11 | 有之以為利，無之以為用 | Form constrains, void functions |
| 22 | 曲則全 | Curving completes (π-operation) |
| 25 | 道大→逝→遠→反 | Recursion cycle |
| 40 | 反者道之動 | Reversal is pattern's movement |
| 48 | 損之又損以至於無為 | Recursive subtraction to non-imposing |
| 64 | 輔萬物之自然而不敢為 | Assist self-so-ness, don't impose |

## Usage

These translations are reference documents for understanding the Dao De Jing as technical notation. They're not meant to replace literary translations but to reveal the geometric structure beneath them.

Start with:
1. `meta/chapter25_rosetta_stone.md` - The decoder ring
2. `lexicon/00_lexicon_introduction.md` - How to read characters as equations
3. `chapters/chapter64_2025-11-26.md` - The 無為 definition

---

*Author: Will Goldstein, 2025*
*With structural analysis assistance from Claude (Anthropic)*
