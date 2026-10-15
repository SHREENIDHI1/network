# Content guide — adding sounds, patterns, verses and helplines

Everything below is plain data. Run `npm test` afterwards: the content tests catch missing files, duplicate ids, unlabelled tones and malformed verses.

## A new soundscape

1. Put the file in `audio/loops/` — WAV or M4A, a seamless loop (fade the end into the start), mono 22–44 kHz is plenty.
2. Add one line to `AUDIO_FILES` in `data/content.ts`:
   ```ts
   'mountain-stream': require('../audio/loops/mountain-stream.wav'),
   ```
3. Add an entry to `data/sounds.json`:
   ```json
   { "id": "mountain-stream", "title": "Mountain stream", "category": "Water",
     "icon": "water-outline", "defaultVolume": 0.6, "a11yLabel": "A cool mountain stream" }
   ```
   `icon` is any [Ionicons](https://icons.expo.fyi) name. `category` creates a filter chip automatically.

Replacing a generated sound with a real recording: keep the same file name, or point `AUDIO_FILES` at the new file. Keep the licence (e.g. CC0) and credit in a comment.

## A relaxation tone

Same as above, but the file goes in `audio/tones/` and the entry in `data/tones.json`:
```json
{ "id": "flute-drone", "title": "Bansuri drone", "kind": "drone", "icon": "musical-notes-outline",
  "defaultVolume": 0.4, "detail": "A soft flute drone on Sa.", "headphones": false }
```
Rules: describe the *sound*, never a health outcome. No "cures", "treats", "heals", "reduces anxiety", "fixes insomnia". The screen always shows the "relaxation audio — not a medical treatment" label. Binaural tracks must have `"headphones": true`.

## A breathing pattern

`data/breathing.json` — phases are `in`, `hold`, `out`, `holdOut`, each 0–12 seconds; inhale and exhale at least 2 s.
```json
{ "id": "triangle", "name": "Triangle", "description": "In, hold, out — equal and simple.",
  "phases": [{ "kind": "in", "seconds": 4 }, { "kind": "hold", "seconds": 4 }, { "kind": "out", "seconds": 4 }],
  "cycles": 8, "builtIn": true }
```

## A shloka

`data/shlokas.json`. Accuracy matters more than quantity:
- Copy Devanagari and IAST from a standard edition (e.g. Gita Press for the Gita). Never compose or "fix" a verse.
- `meaning` is a faithful plain-English rendering; `reflection` is a gentle, everyday application (clearly ours, not scripture).
- Set `"verified": true` only after someone has checked it against the source. Unverified verses are never shown.
- `themes` drive the "shloka of the day" matching: `work-stress, anxiety, letting-go, focus, low-mood, impermanence, equanimity, steady-mind, peace, self-compassion, courage, sleep, balance, meditation, practice, spiritual, hope, morning, self-worth`.

## A wisdom line

`data/wisdomLines.json` — short comforting lines used in Calm Now. If it paraphrases a text, say so in `source` (e.g. `"Bhagavad Gita 2.48 (paraphrase)"`). Never present a paraphrase as a quotation.

## Helplines

`data/helplines.json`:
```json
{ "id": "icall", "name": "iCall", "org": "TISS", "phone": "…", "hours": "…", "languages": "…",
  "verified": false, "note": "Verify before release." }
```
Unverified numbers show a small developer note in debug builds only. Verify every number before release.

## Safety wording

All disclaimers, the privacy note, tone labels and crisis wording live in `data/copy.ts` so they can be reviewed in one place.
