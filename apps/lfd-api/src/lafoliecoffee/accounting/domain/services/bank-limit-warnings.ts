import {
  isDeadBatchStatus,
  type CollectionBatchStatus,
} from "../entities/collection-batch-status.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/**
 * **Les plafonds de la banque, comparés à un lot** (plan
 * `plan-plafonds-de-la-banque.md`, PL2 ; § 6 et § 7 l'emportent sur § 2.2).
 *
 * Trois AVERTISSEMENTS, aucun refus (Q1, Hugo, 2026-10-24) : on ne sait pas
 * ce que fait la banque d'une remise au-dessus d'un plafond, et un plafond se
 * relève par un appel au chargé d'affaires. Un plafond `null` (« non
 * renseigné ») n'est pas comparé : son constat est absent. Strictement
 * au-dessus seulement — un montant ÉGAL au plafond est dans la convention.
 */

/** Les trois plafonds d'un schéma, en centimes ; `null` = non renseigné. */
export interface LimitsToCompare {
  readonly perDebitCents: number | null;
  readonly perRemittanceCents: number | null;
  readonly monthlyCents: number | null;
}

/** Une ligne d'un lot : un débiteur, ce qu'elle prélève. */
export interface LimitLotLine {
  readonly rank: number;
  readonly debtorName: string;
  readonly amountCents: number;
}

/** Un lot de l'entité, tel que le cumul le lit. */
export interface LimitLot {
  readonly id: string;
  readonly scheme: SepaScheme;
  readonly status: CollectionBatchStatus;
  /** `AAAA-MM-JJ` (jour de Paris) ; `null` pour un lot d'avant le 2026-10-08. */
  readonly requestedCollectionDay: string | null;
  readonly lines: readonly LimitLotLine[];
}

export interface DebitOverLimit {
  readonly rank: number;
  readonly debtorName: string;
  readonly amountCents: number;
  readonly limitCents: number;
}

export interface AmountOverLimit {
  readonly totalCents: number;
  readonly limitCents: number;
}

export interface MonthlyOverLimit extends AmountOverLimit {
  readonly month: string;
  readonly batchCount: number;
}

export interface BankLimitWarnings {
  readonly batchId: string;
  readonly scheme: SepaScheme;
  readonly perDebit: readonly DebitOverLimit[];
  readonly perRemittance: AmountOverLimit | null;
  readonly monthly: MonthlyOverLimit | null;
}

/** Le total d'un lot : la somme de ses lignes, calculée — il n'est pas rangé (§ 6, MINEUR). */
export function lotTotalCents(lot: Pick<LimitLot, "lines">): number {
  return lot.lines.reduce((sum, line) => sum + line.amountCents, 0);
}

/**
 * **Le mois du cumul** d'un lot : `AAAA-MM`, ou `null` s'il ne se place pas.
 *
 * 🔴 SUPPOSÉ : le mois civil de l'**échéance** (`ReqdColltnDt`), le jour où la
 * banque débite. Q2 n'est pas tranchée — seule la banque sait si elle compte
 * au mois de l'échéance ou du dépôt (Q-B7, `reponses-de-la-banque.md`
 * § 5 bis). C'est la SEULE fonction qui porte ce choix : une réponse « mois
 * de dépôt » se corrige ici.
 *
 * L'échéance est déjà un jour de Paris (`AAAA-MM-JJ`) : son mois est le mois
 * civil de Paris, sans conversion.
 *
 * Un lot sans échéance (constitué avant le 2026-10-08) rend `null` et n'est
 * pas compté : tous sont d'avant le premier dépôt réel — le contrat CENET
 * REMISES n'était pas signé, pré-release —, aucun ne tombe donc dans un mois
 * où un vrai plafond s'applique (contradiction de vitruve, § 6, BLOQUANT).
 */
export function limitMonthOf(lot: Pick<LimitLot, "requestedCollectionDay">): string | null {
  return lot.requestedCollectionDay === null ? null : lot.requestedCollectionDay.slice(0, 7);
}

/**
 * Les constats de plafond du lot `lot`, au regard des autres lots `entityLots`
 * de la MÊME entité (l'appelant les borne).
 *
 * Le cumul mensuel somme ce que la banque recevra dans le mois : les lots
 * `constituted` ET `deposited` (Q3 — l'avertissement arrive avant le dépôt,
 * quand on peut agir), jamais `cancelled` ni `rejected_by_bank`, du même
 * schéma et du même mois ({@link limitMonthOf}), ce lot compris. Une
 * représentation est un nouveau débit présenté à la banque : elle compte. Un
 * impayé ne retire rien, le débit a été présenté. Les prélèvements d'essai
 * (≤ 1 €) vivent hors des lots et ne déplacent aucun plafond.
 *
 * `null` pour un lot mort : il ne part pas, il n'a rien à avertir.
 */
export function bankLimitWarningsOf(
  limits: LimitsToCompare,
  lot: LimitLot,
  entityLots: readonly LimitLot[],
): BankLimitWarnings | null {
  if (isDeadBatchStatus(lot.status)) {
    return null;
  }
  return {
    batchId: lot.id,
    scheme: lot.scheme,
    perDebit: debitsOverLimit(limits.perDebitCents, lot.lines),
    perRemittance: overLimit(lotTotalCents(lot), limits.perRemittanceCents),
    monthly: monthlyOverLimit(limits.monthlyCents, lot, entityLots),
  };
}

function debitsOverLimit(
  limitCents: number | null,
  lines: readonly LimitLotLine[],
): readonly DebitOverLimit[] {
  if (limitCents === null) {
    return [];
  }
  return [...lines]
    .filter((line) => line.amountCents > limitCents)
    .sort((a, b) => a.rank - b.rank)
    .map((line) => ({
      rank: line.rank,
      debtorName: line.debtorName,
      amountCents: line.amountCents,
      limitCents,
    }));
}

function overLimit(totalCents: number, limitCents: number | null): AmountOverLimit | null {
  return limitCents !== null && totalCents > limitCents ? { totalCents, limitCents } : null;
}

function monthlyOverLimit(
  limitCents: number | null,
  lot: LimitLot,
  entityLots: readonly LimitLot[],
): MonthlyOverLimit | null {
  const month = limitMonthOf(lot);
  if (limitCents === null || month === null) {
    return null;
  }
  const counted = [
    lot,
    ...entityLots.filter(
      (other) =>
        other.id !== lot.id &&
        other.scheme === lot.scheme &&
        !isDeadBatchStatus(other.status) &&
        limitMonthOf(other) === month,
    ),
  ];
  const totalCents = counted.reduce((sum, each) => sum + lotTotalCents(each), 0);
  const over = overLimit(totalCents, limitCents);
  return over === null ? null : { ...over, month, batchCount: counted.length };
}
