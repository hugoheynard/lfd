import type { SiteView } from '@lfd/contracts';

/**
 * Les rôles d'un site, en mots, dans l'ordre où on les lit — les MÊMES dans
 * la liste des sites et dans l'en-tête de la carte des rôles.
 */
export function roleLabels(site: SiteView): readonly string[] {
  const labels: string[] = [];
  if (site.pickup) {
    labels.push(pickupLabel(site.pickupAudiences));
  }
  if (site.supply === 'transfer') {
    labels.push(site.transferMode === 'dedicated' ? 'Transfert dédié' : 'Transfert intégré');
  }
  if (site.deliveryDeparture) {
    labels.push('Livraison');
  }
  if (site.eatIn) {
    labels.push('Sur place');
  }
  return labels;
}

/** « Retrait », ou sa clientèle quand le site est réservé (Hugo, 2026-10-15). */
function pickupLabel(audiences: SiteView['pickupAudiences']): string {
  if (audiences === undefined || (audiences.b2b && audiences.b2c)) {
    return 'Retrait';
  }
  return audiences.b2b ? 'Retrait pros' : 'Retrait particuliers';
}
