import { describe, expect, it } from 'vitest';

import { autopilotRunSentence } from './autopilot-run-wording';

/** Les instants ne sont lus qu'en mots : aucune comparaison au mur. */
describe('la dernière tentative de la préparation automatique', () => {
  it('une clôture manquée (R4b) se voit, dit le geste et garde le message', () => {
    const sentence = autopilotRunSentence({
      cycleClosesAt: '2026-09-30T22:00:00.000Z',
      ranAt: '2026-09-30T23:15:00.000Z',
      outcome: 'missed',
      message: 'La période close le 1er septembre 2026 n’a jamais été préparée.',
    });

    expect(sentence.tone).toBe('warning');
    expect(sentence.said).toContain('un passage précédent a été manqué');
    expect(sentence.said).toContain('Préparez le lot à la main');
    expect(sentence.detail).toContain('1er septembre 2026');
  });
});
