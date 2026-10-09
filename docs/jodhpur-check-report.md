# Jodhpur division data — items to verify ("check")

Source: User's seed reading of the NWR Jodhpur Division track map. The map image was NOT available to the build, so nothing beyond the seed has been read from it.

Stations: 156 · Sections: 12 · Items to check: 32

| # | Where | Code | Name | Field | Current value | Why |
|---|---|---|---|---|---|---|
| 1 | station | REN | ? | name | ? | Station name not given in seed — read from map. |
| 2 | station | UNK-CHANDAN | Chandan | code | (unknown) | Station code not readable in seed — read from map. |
| 3 | station | UNK-DIDWANA | Didwana | code | (unknown) | Station code not readable in seed — read from map. |
| 4 | station | UNK-LANELA | Lanela | code | (unknown) | Station code not readable in seed — read from map. |
| 5 | station | UNK-SONU | Sonu | code | (unknown) | Station code not readable in seed — read from map. |
| 6 | S1 | — | JU–MTD (trunk) | controlBoard | (unknown) | Control board for the JU–MTD trunk is not given in the seed — read the map legend. |
| 7 | S1 | RKB | Raikabag Palace Jn | km | ~622.55 | Seed lists S1 as JU–BNO directly, but RKB chainage 622.55 lies between JU 624.96 and BNO 610.31 — confirm RKB is on this line. |
| 8 | S1 | JWL | Jajiwal | km | ~602 | ~602 (approximate in seed) |
| 9 | S1 | AAS | Asranada | km | ~593 | ~593 |
| 10 | S1 | KSW | Kheri Salwa | km | ~584 | ~584 |
| 11 | S2 | REN | ? | km | (unknown) | km not given in seed |
| 12 | S2 | JAC | Jalsu | km | (unknown) | km not given in seed |
| 13 | S3 | GCH | Gachhipura | km | (unknown) | km not given in seed |
| 14 | S3 | BSRL | Besroli | km | (unknown) | km not given in seed |
| 15 | S3 | BOW | Borawar | km | (unknown) | km not given in seed |
| 16 | S3 | MKN | Makrana | km | (unknown) | km not given in seed |
| 17 | S3 | KMNC | Kuchaman City | km | (unknown) | km not given in seed |
| 18 | S3 | NAC | Nawa City | km | (unknown) | km not given in seed |
| 19 | S3 | SBR | Sambhar Lake | km | (unknown) | km not given in seed |
| 20 | S3 | GDH | Gudha | km | (unknown) | km not given in seed |
| 21 | S4 | UNK-DIDWANA | Didwana | km | ~410.86 | ~410.86; code not in seed |
| 22 | S4 | SVO | Sahvrad | km | ~397.7 | ~397.7 |
| 23 | S4 | BLSD | Balsamand | km | (unknown) | km not given in seed |
| 24 | S7 | UNK-CHANDAN | Chandan | km | ~248.64 | ~248.64; code not in seed |
| 25 | S7 | UNK-LANELA | Lanela | km | (unknown) | Beyond JSM — verify |
| 26 | S7 | UNK-SONU | Sonu | km | (unknown) | Beyond JSM — verify |
| 27 | S8 | KAI | Kairla | km | ~682.59 | ~682.59 |
| 28 | S8 | PMY | Pali Marwar | km | ~697.65 | ~697.65 |
| 29 | S8 | BOM | Bomadra | km | ~708.38 | ~708.38 |
| 30 | S8 | RKZ | Rajkiawas | km | ~717.56 | ~717.56 |
| 31 | S11A | — | PPR–BARA (branch) | controlBoard | (unknown) | Control board not given in seed. |
| 32 | S11B | — | MTD–MEC (branch) | controlBoard | (unknown) | Control board not given in seed. |

## J2 length (JU–MTD–DNA–FL) from map chainage

- JU–MTD: 624.96 − 520.85 = **104.11 km**
- MTD–DNA: 520.85 − 476.61 = **44.24 km** (Source note: CAMTECH handbook says 43.5 km; map value used)
- DNA–FL: 108.75 − 0.00 = **108.75 km**
- Total: **257.1 km** (Source note: CAMTECH case study says ~256.5 km)
- Stops on J2 in the seed: **27** (JU, RKB, BNO, JWL, AAS, KSW, PPR, SWF, UMED, KXG, GOTN, JOM, MTD, KQW, REN, JAC, JACN, DNA, GCH, BSRL, BOW, MKN, KMNC, NAC, SBR, GDH, FL). CAMTECH case study counts **29 POPs** (6 junctions + 23 stations) — 2 station(s) may be missing from the seed; please check the map between JU and FL.

Validation: no structural errors
