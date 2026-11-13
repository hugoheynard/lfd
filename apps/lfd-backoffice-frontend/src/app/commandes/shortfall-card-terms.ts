import type { SettlementRegime } from '@lfd/contracts';

/**
 * Ce que la carte fait au départ incomplet (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 2.1 et § 7) :
 * la décision est refusée tant que la carte n'est pas encaissée ou qu'une
 * hausse par carte est vivante ; encaissée, le reste se rembourse au solde.
 * `null` : la commande n'est pas réglée par carte.
 */
export type ShortfallCardTerms = 'card_unpaid' | 'card_increase_pending' | 'refunded_at_settlement';

/** Les deux refus que la décision opposerait — l'écran les dit avant le geste. */
const REFUSALS: ReadonlySet<ShortfallCardTerms> = new Set(['card_unpaid', 'card_increase_pending']);

/**
 * La règle des termes du serveur (`termsRefusalOf`), relue sur la fiche :
 * `settlement` est calculé au serveur, `increasePending` est la hausse par
 * carte vivante (`cardIncrease`). Le serveur reste juge : il refuse de
 * nouveau au geste, avec sa phrase.
 */
export function shortfallCardTermsOf(
  settlement: SettlementRegime | null,
  increasePending: boolean,
): ShortfallCardTerms | null {
  if (settlement === 'due') {
    return 'card_unpaid';
  }
  if (settlement !== 'paid') {
    return null;
  }
  return increasePending ? 'card_increase_pending' : 'refunded_at_settlement';
}

/** La décision serait refusée pour ces termes. */
export function isShortfallCardRefusal(terms: ShortfallCardTerms | null): boolean {
  return terms !== null && REFUSALS.has(terms);
}

/** Le mot du bandeau du manque : court, la décision dessous dit la phrase entière. */
export const SHORTFALL_CARD_SHORT_TEXT: Readonly<Record<ShortfallCardTerms, string>> = {
  card_unpaid: 'Carte pas encore encaissée : la décision attend le paiement.',
  card_increase_pending: 'Hausse par carte en cours : la décision attend qu’elle soit réglée.',
  refunded_at_settlement: 'Carte encaissée : le reste abandonné sera remboursé au solde.',
};

/** La phrase de chaque terme, pour une équipe qui n'a pas le code sous les yeux. */
export const SHORTFALL_CARD_TEXT: Readonly<Record<ShortfallCardTerms, string>> = {
  card_unpaid:
    'Réglée par carte, et la carte n’est pas encore encaissée : le départ incomplet attend le paiement. Relancez le règlement, ou complétez la commande.',
  card_increase_pending:
    'Une hausse par carte est en cours : réglez-la depuis la fiche commande (payée et appliquée, ou abandonnée) avant de décider du départ.',
  refunded_at_settlement:
    'Réglée par carte : le reste abandonné sera remboursé sur la carte au solde, quand le dernier envoi sera remis. Le client recevra le montant par e-mail quand le remboursement aboutira.',
};
