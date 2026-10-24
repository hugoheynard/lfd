import type {
  CollectionProcedureAmountOverLimitView,
  CollectionProcedureDebitOverLimitView,
  CollectionProcedureMonthlyOverLimitView,
} from '@lfd/contracts';

import { euros } from '../../invoice-dossier-format';
import { periodLabel } from '../../issued-invoice-format';

/**
 * Les phrases des plafonds de la banque (plan `plan-plafonds-de-la-banque.md`,
 * PL2). Des avertissements : la banque peut relever un plafond sur un appel,
 * l'outil ne ferme donc aucun geste.
 */

/** En-tête du constat unitaire, accordé au nombre de débiteurs. */
export function perDebitHeadline(count: number): string {
  return count === 1
    ? 'Un débiteur de ce lot dépasse le plafond par prélèvement de la banque :'
    : `${count} débiteurs de ce lot dépassent le plafond par prélèvement de la banque :`;
}

/** « 1 250,00 € pour un plafond de 1 000,00 € » — une ligne du lot. */
export function perDebitLine(debit: CollectionProcedureDebitOverLimitView): string {
  return `${euros(debit.amountCents)} pour un plafond de ${euros(debit.limitCents)}`;
}

/** Le total du lot face au plafond par remise. */
export function perRemittanceSentence(over: CollectionProcedureAmountOverLimitView): string {
  return `Le total de ce lot, ${euros(over.totalCents)}, dépasse le plafond par remise de la banque (${euros(over.limitCents)}).`;
}

/** Le cumul du mois d'échéance face au plafond mensuel. */
export function monthlySentence(over: CollectionProcedureMonthlyOverLimitView): string {
  const lots = over.batchCount === 1 ? '1 lot' : `${over.batchCount} lots`;
  return `Le cumul de ${periodLabel(over.month)}, ${euros(over.totalCents)} sur ${lots} dont celui-ci, dépasse le plafond mensuel de la banque (${euros(over.limitCents)}).`;
}

/** Q2 non tranchée (Hugo, 2026-10-24) : le mois compté est SUPPOSÉ. */
export const MONTHLY_BASIS_NOTE =
  'Le mois compté est celui de l’échéance des lots, constitués ou déposés — la banque pourrait compter au mois du dépôt.';

/** Commun aux trois constats. */
export const BANK_LIMIT_NOTE =
  'Un avertissement : le dépôt reste possible, et le chargé d’affaires peut relever un plafond.';
