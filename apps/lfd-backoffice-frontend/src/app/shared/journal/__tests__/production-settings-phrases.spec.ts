import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Les phrases des réglages du fournil** (plan `arret-du-plan.md`, lot A1). */

function fact(type: FactInput['type'], payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'production_settings',
    subjectId: 'production_settings',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

describe('le réglage d’arrêt (production_settings.close_changed)', () => {
  it('dit le mode et ses heures, avant et après, sans rien laisser au détail', () => {
    const changed = fact('production_settings.close_changed', {
      before: { mode: 'manual', closeAt: null, alertAt: '21:00' },
      after: { mode: 'auto', closeAt: '20:30', alertAt: '21:00' },
    });
    expect(sentence(changed)).toBe(
      'Colette Martin a réglé l’arrêt du plan : automatique, alerte à 21:00, arrêt à 20:30 ; c’était manuel, alerte à 21:00',
    );
    expect(renderFact(changed).detail).toEqual([]);
  });
});

describe('les jours fermés (production_closed_day.*)', () => {
  it('dit le jour fermé puis rouvert', () => {
    const payload = { subjectLabel: '2026-12-25', serviceDay: '2026-12-25' };
    expect(sentence(fact('production_closed_day.added', payload))).toMatch(
      /^Colette Martin a fermé le fournil le .*25/u,
    );
    expect(sentence(fact('production_closed_day.removed', payload))).toMatch(
      /^Colette Martin a rouvert le fournil le .*25/u,
    );
  });
});
