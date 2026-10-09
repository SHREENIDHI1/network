import { MODULES, type EngineModule } from './modules';
import type { Lab } from './types';

/**
 * Structural validation of the lab registry. Run by a unit test so a broken
 * lab definition fails CI instead of failing in front of a learner.
 */

export const QUIZ_SIZE = 5;
export const QUIZ_MCQ = 4;
export const QUIZ_PRACTICAL = 1;
export const MAX_LEVEL = 12;

const LAB_ID = /^L(\d{1,2})\.(\d{1,2})$/;

export function validateLab(lab: Lab, topologyIds: ReadonlySet<string>): string[] {
  const e: string[] = [];
  const at = `Lab ${lab.id}`;

  const m = LAB_ID.exec(lab.id);
  if (!m) e.push(`${at}: id must look like "L3.2"`);
  else if (Number(m[1]) !== lab.level) e.push(`${at}: id level does not match level ${lab.level}`);
  if (!Number.isInteger(lab.level) || lab.level < 0 || lab.level > MAX_LEVEL) e.push(`${at}: level must be 0..${MAX_LEVEL}`);
  if (!lab.title.trim()) e.push(`${at}: empty title`);
  if (!lab.scenario.trim()) e.push(`${at}: empty scenario`);
  if (!lab.objectives.length) e.push(`${at}: needs at least one objective`);
  if (!topologyIds.has(lab.topologyId)) e.push(`${at}: unknown topologyId "${lab.topologyId}"`);
  for (const mod of lab.requiredModules) if (!(mod in MODULES)) e.push(`${at}: unknown module "${mod as EngineModule}"`);
  if (!(lab.estMinutes > 0)) e.push(`${at}: estMinutes must be > 0`);

  // Tasks + hints (a quiz-only lab may have zero tasks)
  const taskIds = new Set<string>();
  lab.tasks.forEach((t, i) => {
    if (taskIds.has(t.id)) e.push(`${at}: duplicate task id ${t.id}`);
    taskIds.add(t.id);
    if (!t.text.trim()) e.push(`${at}: task ${t.id} has no text`);
    if (!(t.points > 0)) e.push(`${at}: task ${t.id} points must be > 0`);
    if (typeof t.check !== 'function') e.push(`${at}: task ${t.id} has no check`);
    const h = lab.hints[i];
    if (!h || !h.length || h.some((x) => !x.trim())) e.push(`${at}: task ${t.id} needs at least one non-empty hint`);
  });
  if (lab.hints.length !== lab.tasks.length) e.push(`${at}: hints must have one entry per task`);

  // Quiz: 4 MCQ + 1 practical
  if (lab.quiz.length !== QUIZ_SIZE) e.push(`${at}: quiz must have ${QUIZ_SIZE} questions`);
  const mcq = lab.quiz.filter((q) => q.kind === 'mcq').length;
  const practical = lab.quiz.filter((q) => q.kind === 'practical').length;
  if (mcq !== QUIZ_MCQ || practical !== QUIZ_PRACTICAL) e.push(`${at}: quiz must be ${QUIZ_MCQ} MCQ + ${QUIZ_PRACTICAL} practical`);
  const qIds = new Set<string>();
  for (const q of lab.quiz) {
    if (qIds.has(q.id)) e.push(`${at}: duplicate quiz id ${q.id}`);
    qIds.add(q.id);
    if (q.options.length < 2) e.push(`${at}: quiz ${q.id} needs at least 2 options`);
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length)
      e.push(`${at}: quiz ${q.id} correctIndex out of range`);
    if (new Set(q.options).size !== q.options.length) e.push(`${at}: quiz ${q.id} has duplicate options`);
    if (!q.explanation.trim()) e.push(`${at}: quiz ${q.id} needs an explanation`);
  }
  return e;
}

export function validateRegistry(labs: readonly Lab[], topologyIds: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const slots = new Set<string>();
  for (const lab of labs) {
    if (ids.has(lab.id)) errors.push(`Duplicate lab id ${lab.id}`);
    ids.add(lab.id);
    const slot = `${lab.level}:${lab.order}`;
    if (slots.has(slot)) errors.push(`Lab ${lab.id}: order ${lab.order} already used in level ${lab.level}`);
    slots.add(slot);
    errors.push(...validateLab(lab, topologyIds));
  }
  return errors;
}
