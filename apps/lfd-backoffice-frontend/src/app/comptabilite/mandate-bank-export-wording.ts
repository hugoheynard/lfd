import type { MandateBankExclusionReasonView } from '@lfd/contracts';

/**
 * Les mots de la carte « Mandats à la banque ». Ici plutôt qu'en valeur du
 * paquet de contrats : la carte n'importe de `@lfd/contracts` que des TYPES,
 * et un export de valeur neuf serait invisible du serveur de dev tant que son
 * pré-bundle n'est pas purgé (`CLAUDE.md` de la boutique).
 */
export const MANDATE_BANK_EXCLUSION_LABELS: Readonly<
  Record<MandateBankExclusionReasonView, string>
> = {
  taken_over: 'repris d’un autre créancier — la banque doit dire comment déclarer un mandat migré',
  no_account: 'aucun RIB recopié pour ce mandat — saisir le RIB du client',
  no_bic: 'RIB sans BIC — compléter le BIC du client',
};

const PARIS_DAY = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

/** Un instant ISO → « 9 octobre 2026 », jour de Paris. */
export function parisDayLabel(iso: string): string {
  return PARIS_DAY.format(new Date(iso));
}

/** « 1 mandat », « 3 mandats ». */
export function mandatesLabel(count: number): string {
  return `${String(count)} mandat${count > 1 ? 's' : ''}`;
}
