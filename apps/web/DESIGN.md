---
name: Nixx
description: Sandboxed coding agent — a professional, monochrome interface with a single merge-green state accent.
colors:
  primary: "#1a7f37"
  primary-deep: "#10632a"
  primary-soft: "#eaf5ee"
  neutral-bg: "#ffffff"
  neutral-surface: "#f6f6f6"
  neutral-ink: "#0a0a0a"
  neutral-ink-2: "#3f3f46"
  neutral-muted: "#71717a"
  neutral-border: "#e7e7e7"
  neutral-border-strong: "#d4d4d4"
  danger: "#dc2626"
  danger-ink: "#b91c1c"
typography:
  display:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 5.2vw, 3.6rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "13px"
    lineHeight: 1.95
rounded:
  sm: "5px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.neutral-ink}"
    textColor: "{colors.neutral-bg}"
    rounded: "{rounded.md}"
    height: "46px"
    padding: "0 22px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.md}"
    height: "46px"
    padding: "0 22px"
---

# Design System: Nixx

## Overview

**Creative North Star: "The Instrumented Terminal"**

Nixx presents itself the way serious engineering infrastructure does: a monochrome surface of ink on paper, where the only color is the signal. One reserved green — GitHub's merge green — marks state and success, and its rarity is what makes it mean something. The signature surface is the terminal: monospace, prompt-led, honest about what is running and what has completed. The system is professional and calm by construction — no gradients, no glass, no decorative motion — matching the product's promise that work happens somewhere isolated and comes back reviewable.

The aesthetic is the familiar AI developer-tool landing (Cursor, GitHub Copilot, Devin) executed with restraint rather than spectacle. Typography is Geist Sans and Geist Mono, self-hosted. Layout is a single centered column capped at 1120px with generous vertical rhythm. Depth is flat by default; only the terminal and the login card lift off the ground, and only softly.

**Key Characteristics:**

- Monochrome ink-on-paper with one state-green accent, used sparingly.
- Self-hosted Geist Sans / Geist Mono; mono reserved for real data.
- Hairline borders and flat surfaces; soft ambient elevation only on the signature objects.
- Light and dark themes, both native to the same tokens via `prefers-color-scheme`.
- Minimal motion: color shifts only, no transforms or entrance choreography.

## Colors

A restrained, GitHub-honest palette: near-black ink over white (or white ink over near-black), with a single merge-green reserved for state and success.

### Primary

- **Merge Green** (#1a7f37): the one accent. Marks success and active state — the `✓` check, the running status dot, the PR "Open" badge. Dark theme: #3fb950.
- **Merge Green Deep** (#10632a): the readable text form of the accent, used where the accent is text rather than a fill. Dark theme: #56d364.
- **Merge Green Soft** (#eaf5ee): the tinted background behind green state chips. Dark theme: #122619.

### Neutral

- **Ink** (#0a0a0a): primary text and primary-button fill. Dark theme: #f5f5f5 (inverts to white).
- **Ink Muted** (#3f3f46): secondary text and button hover. Dark theme: #d4d4d4.
- **Ink Faint** (#71717a): tertiary text, terminal meta, footer tag. Dark theme: #a3a3a3.
- **Paper** (#ffffff): page background. Dark theme: #0a0a0a.
- **Surface** (#f6f6f6): the terminal body and login-card fill. Dark theme: #141414.
- **Hairline** (#e7e7e7): default 1px border. Dark theme: #262626.
- **Hairline Strong** (#d4d4d4): stronger borders and the terminal's neutral dots. Dark theme: #343434.

### Danger

- **Danger** (#dc2626): error border. Dark theme: #f87171.
- **Danger Ink** (#b91c1c): error text. Dark theme: #fca5a5.

### Named Rules

**The Merge-Green Rule.** The green accent appears only to report state or success — running, open, merged — and never exceeds ~10% of any screen. Its rarity is the signal; a page that turns green has lost the point.

## Typography

**Display Font:** Geist Sans (system-ui fallback)
**Body Font:** Geist Sans (system-ui fallback)
**Label/Mono Font:** Geist Mono (ui-monospace fallback)

**Character:** A single modern grotesque for everything, with a crisp monospace for data. The pairing reads as engineering documentation, not marketing.

### Hierarchy

- **Display** (600, clamp(2.4rem, 5.2vw, 3.6rem), 1.08, -0.03em): hero and section headlines only.
- **Headline** (600, clamp(1.75rem, 3vw, 2.25rem), 1.15, -0.02em): section titles.
- **Title** (600, 17px, -0.01em): step and feature headings.
- **Body** (400, 16px, 1.6): running copy; measure capped at 54–58ch.
- **Mono** (400, 13px, 1.95): terminal output, hashes, status labels, step numerals.

### Named Rules

**The Mono-Is-Data Rule.** Geist Mono appears only where there is real data — code, commands, hashes, status, numerals — never as decorative "technical" dressing.

## Layout

A single centered column capped at 1120px (`--max-width`), with 24px side padding and a 96px vertical rhythm between sections. The hero is a two-column grid (copy left, terminal right) that collapses to a single column at 900px. Navigation is a 64px bar with the wordmark left, anchor links center, actions right; the anchor links hide below 720px. The "how it works" steps sit in a 2×2 grid (1 column under 720px); features in a 3-column grid (1 column under 900px). Section spacing is generous and consistent, with more space above a heading than below it.

## Elevation & Depth

Flat by default. Depth is conveyed through tonal layering (Surface and Hairline) rather than shadow. Only two objects cast a shadow — the terminal and the login card — and only as a soft ambient lift:

### Shadow Vocabulary

- **Ambient Lift** (`box-shadow: 0 1px 1px rgba(0,0,0,0.04), 0 16px 40px -20px rgba(0,0,0,0.25)`): the terminal and login card only.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Elevation belongs to the two signature objects and nowhere else.

## Shapes

Rounded rectangles throughout, with tight radii that keep the system technical rather than playful: 5px for the wordmark's sandbox glyph, 8px for buttons and step numerals, 9px for large buttons, 12px for the terminal window, 16px for the login card, and a 999px pill for status badges. Borders are hairline (1px), used to separate rather than decorate. The wordmark glyph is a bordered square containing a green node — the sandbox in miniature.

## Components

### Buttons

- **Shape:** 8–9px radius, 34px (compact) or 46px (large) height.
- **Primary:** ink fill, paper text; hover shifts fill to Ink Muted (140ms).
- **Ghost:** transparent with a Hairline Strong border; hover darkens the border.
- **Focus:** a 2px ink outline with a 2px offset on all interactive elements.

### Status Badge (chip)

- **Style:** Merge Green Ink text on Merge Green Soft fill, 999px pill, 12px mono.
- **State:** carries a green status dot; used for "running" and "Open".

### Terminal (signature component)

- **Shape:** 12px radius, 1px Hairline border, Surface fill, Ambient Lift shadow.
- **Anatomy:** a bar (neutral dots · title · status with green dot) over a mono body of prompt/result lines, over a footer showing the opened PR with its state badge.
- **Grammar:** muted `$`/`▸` markers, `✓` in Merge Green, values in Ink, meta in Ink Faint.

### Login Card

- **Shape:** 16px radius, 1px Hairline border, Surface fill, Ambient Lift shadow; 400px max width, centered.

### Navigation

- **Style:** 64px bar, 1px bottom Hairline. Wordmark (glyph + "Nixx", 600 weight) left; 14px anchor links in Ink Muted (hover to Ink) center; actions right. Anchor links hide below 720px.

## Do's and Don'ts

### Do:

- **Do** keep the surface monochrome; let the single Merge Green carry all state and success.
- **Do** use Geist Mono for code, commands, hashes, status, and numerals — real data only.
- **Do** keep hairline (1px) borders for separation and hairline-strong only for emphasis.
- **Do** cap line measure at 54–58ch for running copy.
- **Do** support both light and dark via `prefers-color-scheme`, using the same token names.

### Don't:

- **Don't** introduce gradients, glass, or blur — the system is flat and paper-like.
- **Don't** add hover transforms, entrance animations, or scale/lift effects; motion is color-only and ≤150ms.
- **Don't** use emoji or unicode glyphs in place of drawn SVG icons outside the terminal's own output.
- **Don't** add a second accent color; a second hue would break the "green means state" contract.
- **Don't** use shadow on anything but the terminal and the login card.
