import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les phrases des opérations datées** (`operation.*`, plan
 * `documentation/order/architecture-operations-datees.md`, lot 1). Les dates
 * ne sont comparées à aucune horloge : ce sont des valeurs de charge.
 */
function fact(type: FactInput['type'], payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'operation',
    subjectId: 'noel-2026',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

describe('les opérations datées au journal', () => {
  it('dit la préparation, et laisse les dates au détail', () => {
    const rendered = renderFact(
      fact('operation.prepared', {
        subjectLabel: 'Noël 2026',
        name: { fr: 'Noël 2026' },
        lede: null,
        image: null,
        audience: 'both',
        announceFrom: '2026-10-31T23:00:00.000Z',
        orderFrom: null,
        orderUntil: '2026-12-21T11:00:00.000Z',
        pickupFrom: '2026-12-20',
        pickupUntil: '2026-12-24',
      }),
    );

    expect(rendered.sentence).toBe('Colette Martin a préparé l’opération « Noël 2026 »');
    expect(rendered.detail.map((row) => row.label)).toContain('Clôture des commandes');
  });

  it('nomme les dates qui ont bougé', () => {
    const { sentence } = renderFact(
      fact('operation.rescheduled', {
        subjectLabel: 'Noël 2026',
        changes: {
          orderUntil: { from: '2026-12-21T11:00:00.000Z', to: '2026-12-20T11:00:00.000Z' },
        },
      }),
    );

    expect(sentence).toBe(
      'Colette Martin a redaté l’opération « Noël 2026 » : clôture des commandes',
    );
  });

  it('dit la clientèle en mots, jamais en code', () => {
    const { sentence } = renderFact(
      fact('operation.audience_changed', {
        subjectLabel: 'Noël 2026',
        audience: { from: 'both', to: 'pro' },
      }),
    );

    expect(sentence).toBe(
      'Colette Martin a passé la clientèle de l’opération « Noël 2026 » de « Professionnels et particuliers » à « Professionnels »',
    );
  });

  it('compte la sélection, et laisse les SKU au détail', () => {
    const rendered = renderFact(
      fact('operation.selection_saved', {
        subjectLabel: 'Noël 2026',
        skus: { from: [], to: ['BUC-001', 'GAL-002'] },
      }),
    );

    expect(rendered.sentence).toBe(
      'Colette Martin a composé la sélection de l’opération « Noël 2026 » : 2 articles',
    );
    expect(rendered.detail).not.toEqual([]);
  });

  it('dit la modification des textes et l’archivage', () => {
    expect(
      renderFact(
        fact('operation.edited', {
          subjectLabel: 'Noël',
          changes: { name: { from: { fr: 'Noël 2026' }, to: { fr: 'Noël' } } },
        }),
      ).sentence,
    ).toBe('Colette Martin a modifié l’opération « Noël » : nom');
    expect(renderFact(fact('operation.archived', { subjectLabel: 'Noël 2026' })).sentence).toBe(
      'Colette Martin a archivé l’opération « Noël 2026 »',
    );
  });
});
