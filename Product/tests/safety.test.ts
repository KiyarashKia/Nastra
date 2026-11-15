import { describe, expect, it } from 'vitest';
import { screenText } from '../src/nastra/safety/redflags';

describe('independent safety screen', () => {
  it.each([
    ["I'm dizzy and I just blacked out for a second", 'loss_of_consciousness'],
    ["Room is tilting and I've got this crushing feeling in my chest", 'chest_pain'],
    ['Worst headache of my life', 'thunderclap_headache'],
    ['my words are slurring a bit', 'neuro_deficit'],
    ["I don't want to be here anymore", 'self_harm'],
    ['Hard to breathe and my heart is pounding', 'breathing'],
    ['Actually yes, I nearly passed out a minute ago', 'loss_of_consciousness'],
    ['I think I might faint', 'loss_of_consciousness'],
    ['seeing double vision now', 'neuro_deficit'],
  ])('escalates: %s', (text, id) => {
    const s = screenText(text);
    expect(s.critical).toBe(true);
    expect(s.hits.map((h) => h.id)).toContain(id);
    expect(s.urgencyFloor).toBe('warning');
  });

  it.each([
    'I feel the room is tilting',
    'I feel dizzy, no chest pain, no headache',
    'No, none of those. Started after my workout.',
    "Can't switch off before the briefing",
    "Feeling low and I don't want to talk to anyone",
    'I did not pass out, just felt off',
    'Show me my stress trend',
  ])('does not escalate: %s', (text) => {
    expect(screenText(text).critical).toBe(false);
  });

  it('records negated red flags without escalating', () => {
    const s = screenText('I feel dizzy, no chest pain');
    expect(s.critical).toBe(false);
    expect(s.negated.map((n) => n.id)).toContain('chest_pain');
  });

  it('negation does not cross a clause boundary', () => {
    // "no headache" must not cancel the chest pain in the next clause.
    const s = screenText('No headache, but my chest hurts');
    expect(s.critical).toBe(true);
  });
});

describe('safety screen — deterioration language (2026-11-14 chat)', () => {
  it.each([
    'hey i feel shortness in breath and shaking hands', 'trouble breathing', "I can't get enough air", 'breathless',
    'im barely standing', 'I think I might pass out', 'my legs gave out', 'everything is going dark',
    'hel', 'help', 'HELP!!', 'sos', 'I need help', 'call the surgeon', 'this is an emergency',
  ])('escalates: %s', (t) => expect(screenText(t).critical).toBe(true));

  it.each([
    'i need help with my sleep log', 'help me understand my HRV', 'hello', 'no shortness of breath',
    "I didn't pass out", 'what counts as an emergency', 'out of breath after the treadmill, otherwise fine',
  ])('does not escalate: %s', (t) => expect(screenText(t).critical).toBe(false));
});
