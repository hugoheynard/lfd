/**
 * Le relevé de la maquette — les commandes telles qu'elles se reportent en
 * comptabilité.
 *
 * ⚠️ SIMULATION, mais la donnée, elle, n'a rien de neuf : c'est celle de
 * `facturation-page` au back-office, groupée par période et séparée selon le
 * terme accordé. `09-mes-factures.md` ne demande que deux ajouts — le droit de
 * lecture client sur son propre relevé, et la DATE DE CLÔTURE exposée au client
 * (aujourd'hui calculée côté staff).
 *
 * La facture, elle, est déposée par le comptable APRÈS la clôture. Un mois
 * ouvert n'en a pas et le dit à sa place : aucun bouton grisé.
 */

/** Une commande du registre — la ligne qu'on vient chercher sous le montant. */
export interface LedgerOrder {
  readonly reference: string;
  readonly day: string;
  readonly amount: number;
  /** Le moyen de paiement, pour le registre « à la commande » seulement. */
  readonly method: string;
}

/** Un registre d'un mois : ce qui part au compte, ou ce qui est déjà réglé. */
export interface LedgerRegister {
  readonly total: number;
  readonly orders: readonly LedgerOrder[];
}

/** La facture DÉPOSÉE — l'objet qu'on télécharge, pas une ligne de plus. */
export interface DepositedInvoice {
  readonly reference: string;
  readonly filed: string;
  readonly total: number;
  readonly settled: boolean;
  /** « échéance le 31/03 » quand elle attend, « réglée le 12/02 » quand c'est fait. */
  readonly due: string;
}

export interface LedgerMonth {
  readonly month: string;
  readonly year: string;
  /** Le mois ouvert porte sa clôture à venir ; les autres, la date passée. */
  readonly open: boolean;
  readonly closing: string;
  readonly account: LedgerRegister;
  /** `null` : ce mois n'a porté aucune commande réglée à la commande. */
  readonly perOrder: LedgerRegister | null;
  readonly invoice: DepositedInvoice | null;
}

export const MOCK_LEDGER: readonly LedgerMonth[] = [
  {
    month: 'Mars',
    year: '2026',
    open: true,
    closing: 'clôture le 31/03',
    account: {
      total: 248.6,
      orders: [
        { reference: '#4821', day: '18 mars', amount: 96.4, method: '' },
        { reference: '#4808', day: '11 mars', amount: 84.2, method: '' },
        { reference: '#4796', day: '4 mars', amount: 68.0, method: '' },
      ],
    },
    perOrder: {
      total: 34.8,
      orders: [
        { reference: '#4818', day: '16 mars', amount: 22.4, method: 'CB' },
        { reference: '#4802', day: '7 mars', amount: 12.4, method: 'Apple Pay' },
      ],
    },
    invoice: null,
  },
  {
    month: 'Février',
    year: '2026',
    open: false,
    closing: 'close depuis le 28/02',
    account: {
      total: 312.4,
      orders: [
        { reference: '#4771', day: '26 févr.', amount: 104.8, method: '' },
        { reference: '#4754', day: '19 févr.', amount: 88.2, method: '' },
        { reference: '#4738', day: '12 févr.', amount: 71.6, method: '' },
        { reference: '#4720', day: '5 févr.', amount: 47.8, method: '' },
      ],
    },
    perOrder: {
      total: 18.4,
      orders: [{ reference: '#4749', day: '17 févr.', amount: 18.4, method: 'CB' }],
    },
    invoice: {
      reference: 'FA-2026-0212',
      filed: 'déposée le 3 mars',
      total: 330.8,
      settled: false,
      due: 'échéance le 31/03',
    },
  },
  {
    month: 'Janvier',
    year: '2026',
    open: false,
    closing: 'close depuis le 31/01',
    account: {
      total: 96.2,
      orders: [
        { reference: '#4692', day: '22 janv.', amount: 54.6, method: '' },
        { reference: '#4671', day: '9 janv.', amount: 41.6, method: '' },
      ],
    },
    // Un mois sans régime à la commande le DIT — la cellule vide est explicite.
    perOrder: null,
    invoice: {
      reference: 'FA-2026-0131',
      filed: 'déposée le 4 février',
      total: 96.2,
      settled: true,
      due: 'réglée le 12/02',
    },
  },
  {
    month: 'Décembre',
    year: '2025',
    open: false,
    closing: 'close depuis le 31/12',
    account: {
      total: 402.1,
      orders: [
        { reference: '#4610', day: '28 déc.', amount: 128.4, method: '' },
        { reference: '#4588', day: '21 déc.', amount: 96.2, method: '' },
        { reference: '#4571', day: '17 déc.', amount: 84.6, method: '' },
        { reference: '#4552', day: '10 déc.', amount: 62.4, method: '' },
        { reference: '#4530', day: '3 déc.', amount: 30.5, method: '' },
      ],
    },
    perOrder: {
      total: 26.9,
      orders: [{ reference: '#4599', day: '24 déc.', amount: 26.9, method: 'CB' }],
    },
    invoice: {
      reference: 'FA-2025-1231',
      filed: 'déposée le 6 janvier',
      total: 429.0,
      settled: true,
      due: 'réglée le 09/01',
    },
  },
];

/**
 * Les trois montants qu'on vient chercher AVANT toute ligne.
 *
 * Ils ne s'additionnent jamais entre eux : « au compte » et « à la commande »
 * sont deux registres, et les mélanger serait faux — c'est pourquoi chaque
 * colonne porte son propre total et qu'aucun total général n'existe.
 */
export const MOCK_STATEMENT_SUM = {
  openTotal: 248.6,
  openNote: 'Mars · 3 commandes · clôture le 31/03',
  closedTotal: 408.6,
  closedNote: '3 mois clos, non facturés',
  perOrderTotal: 80.1,
  perOrderNote: '4 commandes réglées',
  accountGrandTotal: 657.2,
  perOrderGrandTotal: 80.1,
} as const;
