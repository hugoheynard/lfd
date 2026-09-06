import { formatHour, formatWindow } from './format-hour';

const NBSP = ' ';

describe('les heures telles qu’on les lit', () => {
  it('laisse tomber les minutes rondes', () => {
    expect(formatHour('07:00')).toBe(`7${NBSP}h`);
  });

  it('garde la demie', () => {
    expect(formatHour('06:30')).toBe(`6${NBSP}h${NBSP}30`);
  });

  it('compose la fenêtre', () => {
    expect(formatWindow('07:00', '08:00', 'avant')).toBe(`7${NBSP}h${NBSP}– 8${NBSP}h`);
  });

  /** Inventer « 0 h – 8 h » ouvrirait une nuit que personne n'a déclarée. */
  it('dit « avant » quand la borne basse manque', () => {
    expect(formatWindow(null, '08:00', 'avant')).toBe(`avant 8${NBSP}h`);
  });
});
