# Sthira (स्थिर) — a calm wellness & meditation app

Sthira ("steady", from the Gita's *sthitaprajna*) helps with everyday stress, anxious moments, low mood and sleep, with comfort and perspective rooted in Hindu / Vedantic wisdom.

**It is for relaxation, self-help and spiritual comfort only.** It does not diagnose, treat or cure anything and is not a substitute for professional care. The safety layer (disclaimer, Support & Help, helplines) is part of the core app, not an add-on.

- One codebase for Android + iOS (React Native, Expo SDK 57, Expo Router).
- Local-first: no account, nothing leaves the phone.
- Dark by default, light theme available; reduced motion, larger text, haptics and screen-reader labels throughout.

---

## Phase 1 — what is built

| Area | What you get |
|---|---|
| Onboarding | 4 gentle screens: welcome → "what brings you here" (goals) → safety & privacy note → comfort setup (name, theme, motion, haptics, cues) |
| Home | Time-of-day greeting, big **I need calm now** button, a suggestion chosen from your goals + time of day, the shloka of the day (tap for Sanskrit), quick tiles |
| Breathe | Box 4-4-4-4, 4-7-8, Calm (4-6), Energize, plus a **custom pattern builder**. Animated orb (eased, slow), phase words + countdown, haptics on every phase change, optional soft cues, screen-reader announcements, keep-awake during sessions |
| Sounds | 13 looping soundscapes (rain, thunder, ocean, river, trickling water, forest, wind, night crickets, fireplace, temple bells, white/pink/brown noise). **Mixer**: up to 6 layers, a volume per layer, fade in/out, **saved mixes**, **sleep timer** 15/30/60/custom with a fade over the final minute, background playback |
| Relaxation tones | Om drone (136.1 Hz), tanpura-style drone, warm pad, binaural alpha-style and theta-style tracks — each clearly labelled *relaxation audio, not a medical treatment*; mixable with soundscapes |
| Calm now | 5-4-3-2-1 grounding (tap, no typing) → 6 slow breaths with soft rain → a line of wisdom → "how are you now?" with a path to support. Every step can be skipped |
| Safety | Onboarding disclaimer; heart icon on every screen → **Support & Help**; **Helplines** screen (one tap opens the dialer); emergency 112; privacy note; "Erase all my data" |
| Practice | The shloka library (14 well-known verses, Devanagari + transliteration + meaning + reflection). Meditations, sleep, journal and the companion arrive in Phase 2 |
| You | Name, goals, theme, text size, comfort toggles, care & privacy links |

`utils/safety.ts` already contains the gentle *sustained low mood* check and the crisis phrase screen (unit-tested); they switch on when mood check-ins and the companion arrive in Phase 2.

---

## Run it on your phone (Expo Go) — 5 minutes

You need Node.js 20+ on your computer and the **Expo Go** app on your phone (Play Store / App Store), with phone and computer on the same Wi-Fi.

```bash
cd sthira
npm install
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iPhone). The app opens on your phone and reloads as you edit.

Notes
- In Expo Go, sound may pause when the screen locks. Locked-screen / background playback works in the APK build below (it needs the `expo-audio` background plugin, already configured in `app.json`).
- If your Wi-Fi blocks the connection, use `npx expo start --tunnel`.

## Build an Android APK

The easiest way is Expo's cloud build service (free tier available):

```bash
npm install -g eas-cli
eas login                     # create a free Expo account if you don't have one
eas build:configure           # first time only; keeps the provided eas.json
eas build -p android --profile preview
```

When it finishes you get a link to download the `.apk` — open it on your Android phone and install (allow "install unknown apps" for your browser/files app).

Local build instead (needs Android Studio + JDK 17):

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

## Develop

```bash
npm test            # unit tests: breathing engine, safety, daily picks, content validation
npm run typecheck   # TypeScript strict
npx expo start --web   # quick look in a browser
npm run gen:audio   # regenerate the procedural sound files (needs python3 + numpy + scipy)
```

## Project structure

```
app/            Expo Router routes (thin files → /screens)
  (tabs)/       Home · Breathe · Sounds · Practice · You
  calm.tsx, support.tsx, helplines.tsx, privacy.tsx, breathing/[id].tsx, pattern-builder.tsx, onboarding.tsx
screens/        one file per screen
components/     ui.tsx (ScreenShell with Help button, Card, GentleButton, Chip, Txt…), BreathOrb.tsx
hooks/          useSettings (theme, a11y, persistence), useMixer, useBreathing, usePatterns, useFeedback
utils/          breathingEngine (pure), audioEngine (mixer, fades, sleep timer), safety, daily, storage
data/           sounds.json, tones.json, breathing.json, shlokas.json, wisdomLines.json, helplines.json, grounding.json, copy.ts, content.ts
audio/          loops/, tones/, cues/  (generated by tools/gen_audio.py)
theme/          palettes (dusk = dark default, dawn = light), spacing, type scale
tools/          gen_audio.py
```

## Adding content

See **CONTENT_GUIDE.md** — sounds, tones, breathing patterns, shlokas, wisdom lines and helplines are all data; no screen code changes needed.

## Before public release — checklist

- [ ] Verify every helpline number in `data/helplines.json` and set `"verified": true` (KIRAN 1800-599-0019 is provided by the owner; Tele-MANAS 14416 is a placeholder to confirm).
- [ ] Have a Sanskrit-literate reviewer check `data/shlokas.json` (text, transliteration and meanings). Only entries with `"verified": true` are ever shown.
- [ ] Optionally replace the generated sounds with licensed recordings (see CONTENT_GUIDE.md).
- [ ] Review `data/copy.ts` (all safety wording lives there).
- [ ] App icon and splash (currently Expo defaults in `/assets`).

## About the audio

All sounds are synthesised by `tools/gen_audio.py` (filtered noise, modelled rain drops, waves, crackles, bird phrases, bells, drones and binaural tones). They are original, so there are no licensing issues. Noise-based sounds are very natural; birds, crickets and thunder are pleasant approximations. Each file is a seamless 30-second loop.

## Privacy

No account, no analytics, no network calls. Settings, saved mixes and custom patterns are stored with AsyncStorage on the device and can be erased from **You → Erase all my data**.
