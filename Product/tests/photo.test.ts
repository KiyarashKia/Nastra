import { describe, expect, it } from 'vitest';
import { normalizePhotoReading } from '../src/nastra/vision/photo';

describe('photo reading validation (model describes, code decides)', () => {
  it('keeps neutral visible observations from a face photo', () => {
    const r = normalizePhotoReading({ kind: 'person', source: 'face', observations: [
      { text: 'Redness in the white of the eye', region: 'left eye', clarity: 'clear' },
      { text: 'Skin looks paler than the lips', region: null, clarity: 'unclear' },
    ] });
    expect(r.kind).toBe('person');
    expect(r.observations.map((o) => o.text)).toEqual(['Redness in the white of the eye', 'Skin looks paler than the lips']);
    expect(r.observations[1].unclear).toBe(true);
    expect(r.unremarkable).toBe(false);
  });
  it('drops anything that names a condition, a cause or an emotion', () => {
    const r = normalizePhotoReading({ kind: 'person', observations: [
      { text: 'Swelling under both eyes', region: 'eyes' },
      { text: 'Bluish lips, likely hypoxia', region: 'lips' },
      { text: 'Looks anxious', region: 'face' },
      { text: 'Rash consistent with an allergic reaction', region: 'cheek' },
    ] });
    expect(r.observations.map((o) => o.text)).toEqual(['Swelling under both eyes']);
    expect(r.rejected).toBe(3);
  });
  it('never claims "nothing stands out" when observations were dropped for wording', () => {
    const r = normalizePhotoReading({ kind: 'person', appears_unremarkable: true, observations: [{ text: 'Signs of a stroke' }] });
    expect(r.observations).toHaveLength(0);
    expect(r.unremarkable).toBe(false);
  });
  it('an unremarkable face photo says so', () => {
    expect(normalizePhotoReading({ kind: 'person', observations: [], appears_unremarkable: true }).unremarkable).toBe(true);
  });
  it('device screens keep only legible fields; unknown kinds become "other"', () => {
    const d = normalizePhotoReading({ kind: 'device', fields: [{ label: 'SpO2', value: '97', unit: '%' }, { label: '', value: '3' }], observations: [{ text: 'x' }] });
    expect(d.fields).toEqual([{ id: 'f0', label: 'SpO2', value: '97', unit: '%', note: undefined }]);
    expect(d.observations).toHaveLength(0);
    expect(normalizePhotoReading({ kind: 'selfie' }).kind).toBe('other');
    expect(normalizePhotoReading('garbage').kind).toBe('other');
  });
});
