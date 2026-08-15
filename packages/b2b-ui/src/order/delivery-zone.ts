import type { DeliveryZoneView } from '@lfd/contracts';

/** Longueur du plus long préfixe qui préfixe `codePostal`, ou -1. */
function longestPrefixLength(prefixes: readonly string[], codePostal: string): number {
  let best = -1;
  for (const prefix of prefixes) {
    if (codePostal.startsWith(prefix) && prefix.length > best) {
      best = prefix.length;
    }
  }
  return best;
}

/**
 * La zone qui couvre `codePostal`, ou `null` — **miroir exact** de la résolution
 * serveur (`resolveForPostalCode` + `longestMatchingPrefix`) : le préfixe le plus
 * long, donc le plus spécifique, gagne.
 *
 * Partagé parce que les deux écrans qui commandent en ont besoin : le panier du
 * client, et la saisie du commercial. Le serveur reste l'autorité — il re-déduit
 * la zone à la passation ; ceci ne sert qu'à annoncer le frais avant, et à ne pas
 * proposer une adresse qu'aucune tournée ne dessert.
 */
export function resolveZoneForPostalCode(
  zones: readonly DeliveryZoneView[],
  codePostal: string,
): DeliveryZoneView | null {
  let best: DeliveryZoneView | null = null;
  let bestLength = -1;
  for (const zone of zones) {
    const length = longestPrefixLength(zone.postalPrefixes, codePostal);
    if (length > bestLength) {
      best = zone;
      bestLength = length;
    }
  }
  return best;
}
