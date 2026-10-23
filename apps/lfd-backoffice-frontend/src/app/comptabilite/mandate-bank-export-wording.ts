import type { MandateBankExclusionReasonView, MandateBankStandingView } from '@lfd/contracts';

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

/** Où en est un mandat, en une ligne de la colonne « État » (2026-10-23). */
export function mandateStandingLabel(standing: MandateBankStandingView): string {
  switch (standing.kind) {
    case 'to_export':
      return 'à exporter';
    case 'in_flight':
      return 'en export';
    case 'imported':
      return `importé le ${parisDayLabel(standing.at)}`;
    case 'reported_by_bank':
      return `signalé par la banque le ${parisDayLabel(standing.at)}`;
    case 'excluded':
      return `écarté : ${MANDATE_BANK_EXCLUSION_LABELS[standing.reason]}`;
  }
}

/**
 * Les gestes du compte rendu CENET sur un mandat (Hugo, 2026-10-23) : grisés
 * dans un export pas encore déposé, ouverts dans un export déposé encore
 * corrigeable, absents ailleurs. L'export qu'ils visent vient avec.
 */
export function mandateReportOf(
  standing: MandateBankStandingView,
): { readonly state: 'pending' | 'open'; readonly exportId: string } | null {
  if (standing.kind === 'in_flight') {
    return { state: 'pending', exportId: standing.exportId };
  }
  return standing.kind === 'imported' && standing.correctable
    ? { state: 'open', exportId: standing.exportId }
    : null;
}
