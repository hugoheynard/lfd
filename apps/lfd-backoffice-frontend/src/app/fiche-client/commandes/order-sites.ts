import type { AdminOrderRow } from '@lfd/contracts';
import type { FoldSelectOption } from 'fold-ng';

/** Ce qu'affiche la colonne « Site » pour le compte lui-même. */
export const OWN_SITE_LABEL = '—';

/** La valeur du filtre « tous les sites » — le compte et ses sous-comptes. */
export const ALL_SITES = '*';

/**
 * Le site d'une commande, vu du compte `accountId` : « — » pour ses propres
 * commandes, l'enseigne du sous-compte sinon.
 */
export function siteLabelOf(row: AdminOrderRow, accountId: string): string {
  if (row.companyId === accountId || row.companyId === null) {
    return OWN_SITE_LABEL;
  }
  return row.companyDisplayName ?? OWN_SITE_LABEL;
}

/**
 * Les choix du filtre par site, lus sur la liste complète : « Tous les sites »,
 * le compte lui-même, puis chaque sous-compte qui a commandé, par nom. Vide si
 * aucune commande ne vient d'un sous-compte — un filtre à un seul choix ne
 * filtre rien.
 */
export function siteChoicesOf(
  rows: readonly AdminOrderRow[],
  accountId: string,
): FoldSelectOption<string>[] {
  const sites = new Map<string, string>();
  for (const row of rows) {
    if (row.companyId !== null && row.companyId !== accountId) {
      sites.set(row.companyId, row.companyDisplayName ?? row.customerLabel);
    }
  }
  if (sites.size === 0) {
    return [];
  }
  const named = [...sites.entries()]
    .sort(([, left], [, right]) => left.localeCompare(right, 'fr'))
    .map(([value, label]) => ({ value, label }));
  return [
    { value: ALL_SITES, label: 'Tous les sites' },
    { value: accountId, label: 'Le compte lui-même' },
    ...named,
  ];
}
