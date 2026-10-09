/**
 * Build-time feature flags.
 *
 * ENABLE_LEGACY_TDM: when false, RailMPLS Lab runs in networking-only mode.
 * SDH/STM, PD-Mux, CWDM, E1/G.703, quad/VF and the signalling/voice terminals
 * that ride on them are hidden from the palette, link dialog, canvas and docs.
 * Their model code is kept, and files containing them still load (the legacy
 * items are preserved in the file but hidden on screen).
 */
export const ENABLE_LEGACY_TDM = false;
