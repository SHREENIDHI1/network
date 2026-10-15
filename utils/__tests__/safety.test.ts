import { crisisSignal, sustainedLowMood } from '../safety';

const days = (scores: number[]) => scores.map((score, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, score }));

describe('sustained low mood', () => {
  it('never triggers on one bad day or too little data', () => {
    expect(sustainedLowMood(days([1]))).toBe(false);
    expect(sustainedLowMood(days([1, 1, 1, 1]))).toBe(false);
    expect(sustainedLowMood(days([4, 4, 4, 4, 4, 4, 1]))).toBe(false);
  });
  it('triggers when most recent check-ins are low', () => {
    expect(sustainedLowMood(days([4, 2, 1, 2, 2, 1, 2]))).toBe(true);
  });
  it('does not trigger if the latest check-in is better', () => {
    expect(sustainedLowMood(days([2, 1, 2, 2, 1, 2, 4]))).toBe(false);
  });
});

describe('crisis signal', () => {
  it('catches English, Hinglish and Hindi phrasing', () => {
    expect(crisisSignal('I want to die')).toBe(true);
    expect(crisisSignal('sometimes i think about Suicide')).toBe(true);
    expect(crisisSignal('ab jeena nahi chahta')).toBe(true);
    expect(crisisSignal('मैं आत्महत्या के बारे में सोचता हूँ')).toBe(true);
  });
  it('stays quiet for ordinary stress', () => {
    expect(crisisSignal('work is killing me with deadlines, so stressed')).toBe(false);
    expect(crisisSignal('I could not sleep last night')).toBe(false);
  });
});
