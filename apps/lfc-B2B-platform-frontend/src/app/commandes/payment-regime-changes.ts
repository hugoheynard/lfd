import type { PaymentTerm } from '../account/account.model';

/**
 * Un **changement de régime de règlement** dans la frise : la société demande à
 * passer d'un terme à un autre (`per_order` → `monthly`, `monthly` → `net60`…).
 * La pastille porte la **date de la demande** ; l'acceptation la place **entre
 * deux mois** (le mois à partir duquel le nouveau régime s'applique).
 */
export interface PaymentRegimeChange {
  readonly id: string;
  readonly from: PaymentTerm;
  readonly to: PaymentTerm;
  /** Date de la demande (ISO). */
  readonly requestedAt: string;
  /** Date d'acceptation (ISO), ou `null` tant que la demande est en attente. */
  readonly acceptedAt: string | null;
  /** Mois `AAAA-MM` à partir duquel le nouveau régime s'applique (place la pastille). */
  readonly effectiveKey: string;
}

/** Clé `AAAA-MM` d'une date. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Jeu de changements **démo** (front-only) : une bascule `per_order → monthly`
 * déjà acceptée (le mois courant), et une demande `monthly → net60` en attente
 * (le mois prochain). À remplacer par l'historique réel des demandes de terme.
 */
export function buildDemoRegimeChanges(now: Date): readonly PaymentRegimeChange[] {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const at = (y: number, m: number, day: number): string =>
    new Date(Date.UTC(y, m, day, 9)).toISOString();
  return [
    {
      id: 'regime_demo_pending',
      from: 'monthly',
      to: 'net60',
      requestedAt: at(year, month, 24),
      acceptedAt: null,
      effectiveKey: monthKey(new Date(Date.UTC(year, month + 1, 1))),
    },
    {
      id: 'regime_demo_accepted',
      from: 'per_order',
      to: 'monthly',
      requestedAt: at(year, month - 1, 20),
      acceptedAt: at(year, month - 1, 28),
      effectiveKey: monthKey(new Date(Date.UTC(year, month, 1))),
    },
  ];
}
