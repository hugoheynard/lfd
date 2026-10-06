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

describe('les destinataires du dossier (production_dossier_recipient.*)', () => {
  const payload = {
    subjectLabel: 'Jeanne Roux',
    kind: 'external',
    staffUserId: null,
  };

  it('dit la personne, ajoutée puis retirée, sans rien laisser au détail', () => {
    const added = fact('production_dossier_recipient.added', payload);
    expect(sentence(added)).toBe(
      'Colette Martin a ajouté Jeanne Roux aux destinataires du dossier du jour',
    );
    expect(renderFact(added).detail).toEqual([]);
    expect(sentence(fact('production_dossier_recipient.removed', payload))).toBe(
      'Colette Martin a retiré Jeanne Roux des destinataires du dossier du jour',
    );
  });
});

describe('le dossier envoyé (production_day.dossier_sent)', () => {
  const payload = {
    subjectLabel: '2026-12-24',
    serviceDay: '2026-12-24',
    sent: 2,
    failed: 0,
    completed: false,
  };

  it('dit le jour et le nombre de destinataires, sans auteur ni détail', () => {
    const sent = { ...fact('production_day.dossier_sent', payload), actorType: 'system' as const };
    expect(sentence(sent)).toMatch(/^Le dossier du .*24.* a été envoyé à 2 destinataires$/u);
    expect(renderFact(sent).detail).toEqual([]);
  });

  it('dit les échecs, et le dossier complété après un retirage', () => {
    const sent = fact('production_day.dossier_sent', { ...payload, failed: 1, completed: true });
    expect(sentence(sent)).toMatch(
      /^Le dossier complété du .*24.* a été envoyé à 2 destinataires \(1 échec\)$/u,
    );
  });
});
