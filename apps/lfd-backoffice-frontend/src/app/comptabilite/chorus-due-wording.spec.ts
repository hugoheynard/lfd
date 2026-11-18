import type { ChorusDepositStatusView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { dueCell, dueClause, payableDueOn } from './chorus-due-wording';

// Des jours comparés entre eux seulement : aucune lecture de l'horloge.
const chorus = (over: Partial<ChorusDepositStatusView>): ChorusDepositStatusView => ({
  state: 'to_deposit',
  paymentDeadlineDays: 30,
  depositedOn: null,
  rejectedOn: null,
  rejectionReason: null,
  acceptedOn: null,
  effectiveDueOn: null,
  ...over,
});

describe("l'échéance d'une facture au back-office", () => {
  it("une facture d'un pro garde son échéance imprimée", () => {
    expect(dueCell('2026-10-03', null)).toBe('3 oct. 2026');
    expect(dueClause('2026-10-03', undefined)).toBe('échéance le 3 oct. 2026');
  });

  it("une facture publique non déposée n'a pas d'échéance : on dit qu'elle attend", () => {
    const status = chorus({});
    expect(payableDueOn('2026-10-03', status)).toBeNull();
    expect(dueCell('2026-10-03', status)).toBe('En attente de dépôt sur Chorus');
    expect(dueClause('2026-10-03', status)).toBe('en attente de dépôt sur Chorus');
  });

  it("une facture publique déposée dit l'échéance effective, pas l'imprimée", () => {
    const status = chorus({
      state: 'deposited',
      depositedOn: '2026-10-10',
      effectiveDueOn: '2026-11-09',
    });
    expect(dueCell('2026-10-03', status)).toBe('9 nov. 2026');
  });

  it('une facture rejetée le dit au lieu de toute date', () => {
    const status = chorus({
      state: 'rejected',
      rejectedOn: '2026-10-12',
      rejectionReason: 'Service inconnu',
    });
    expect(dueCell('2026-10-03', status)).toBe('Rejetée par Chorus');
    expect(dueClause('2026-10-03', status)).toBe('rejetée par Chorus');
  });
});
