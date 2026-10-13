import type { SiteView } from '@lfd/contracts';

/**
 * Les rôles d'un site, en mots, dans l'ordre où on les lit — les MÊMES dans
 * la liste des sites et dans l'en-tête de la carte des rôles.
 */
export function roleLabels(site: SiteView): readonly string[] {
  const labels: string[] = [];
  if (site.pickup) {
    labels.push('Retrait');
  }
  if (site.supply === 'transfer') {
    labels.push(site.transferMode === 'dedicated' ? 'Transfert dédié' : 'Transfert intégré');
  }
  if (site.deliveryDeparture) {
    labels.push('Livraison');
  }
  return labels;
}
