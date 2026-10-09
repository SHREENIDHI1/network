import type { Bi } from './types';

/** Shared notes reused by several docs. Edit text here, not in components. */

export const SAFETY_FIELD_WORK: Bi = {
  en: 'SAFETY-CRITICAL: real field work on this circuit follows the IR Signal & Telecom manuals, RDSO guidelines and zonal instructions — including disconnection/reconnection notices and the Station Master’s knowledge. This simulator is for learning only.',
  hi: 'SAFETY-CRITICAL: is circuit par asli field kaam IR S&T manuals, RDSO guidelines aur zonal instructions ke hisaab se hi hota hai — disconnection/reconnection notice aur SM ki jaankari ke saath. Yeh simulator sirf seekhne ke liye hai.',
};

export const SAFETY_48V: Bi = {
  en: 'Telecom equipment runs on −48 V DC (typical). Switch off or isolate the card/power feed before handling; do not short battery terminals.',
  hi: 'Telecom equipment −48 V DC par chalta hai (typical). Card ya power feed chhoone se pehle isolate karo; battery terminals short mat karo.',
};

export const SAFETY_ESD: Bi = {
  en: 'Wear an ESD wrist strap when inserting or removing cards; hold cards by the edges.',
  hi: 'Card nikalte/lagate waqt ESD wrist strap pehno; card ko kinaron se pakdo.',
};

export const SAFETY_LASER: Bi = {
  en: 'Laser safety: never look into an optical connector or fibre end. Use a power meter or fibre scope with a filter; fit dust caps on unused ports.',
  hi: 'Laser safety: optical connector ya fibre ke end mein kabhi mat jhaanko. Power meter ya filter wala fibre scope use karo; khaali ports par dust cap lagao.',
};

export const SRC_CAMTECH = 'CAMTECH, “An Introductory Handbook on IP-MPLS Technology” (CAMTECH/S/PROJ/2021-22/SP37A)';
export const SRC_IR_TELECOM_MANUAL = 'Indian Railways Telecommunication Manual';
export const SRC_IR_SEM = 'Indian Railways Signal Engineering Manual';
