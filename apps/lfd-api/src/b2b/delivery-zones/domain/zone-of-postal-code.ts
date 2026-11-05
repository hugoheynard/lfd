import { longestMatchingPrefix } from "@lfd/contracts";

/**
 * La zone qui couvre `codePostal` parmi `zones` : celle au **préfixe le plus
 * long** (la plus précise), ou `null`. Une seule règle, que lisent le frais,
 * le fait d'acheminement des promotions et la vue des remplacements.
 */
export function zoneOfPostalCode<Zone extends { readonly postalPrefixes: readonly string[] }>(
  zones: readonly Zone[],
  codePostal: string,
): Zone | null {
  let best: Zone | null = null;
  let bestLength = -1;
  for (const zone of zones) {
    const length = longestMatchingPrefix(zone.postalPrefixes, codePostal);
    if (length > bestLength) {
      best = zone;
      bestLength = length;
    }
  }
  return best;
}
