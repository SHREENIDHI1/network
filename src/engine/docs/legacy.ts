import { blockInstrumentDoc, bpacDoc, controlPhoneDoc, dataLoggerDoc, lcGatePhoneDoc } from './legacyField';
import { admStm16Doc, admStm1Doc, admStm4Doc, cwdmDoc, exchangeDoc, pdmuxDoc } from './legacyTdm';
import type { DeviceDoc } from './types';

/** All legacy (PDH/SDH/VF) equipment docs. */
export const LEGACY_DOCS: DeviceDoc[] = [
  pdmuxDoc,
  admStm1Doc,
  admStm4Doc,
  admStm16Doc,
  cwdmDoc,
  controlPhoneDoc,
  blockInstrumentDoc,
  bpacDoc,
  dataLoggerDoc,
  lcGatePhoneDoc,
  exchangeDoc,
];
