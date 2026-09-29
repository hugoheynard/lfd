/** Les champs d'une adresse livrée que le géocodage lit. */
export interface GeocodableAddress {
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
}

/**
 * **La clé d'une adresse** pour le cache du géocodage (L7-C10) : minuscules,
 * sans accents ni ponctuation, espaces resserrés. Deux saisies de la même
 * adresse (« 12 Rue du Pont » et « 12, rue du pont ») ont la même clé, donc un
 * seul géocodage. L'adaptateur n'en garde que l'empreinte.
 */
export function addressKeyOf(address: GeocodableAddress): string {
  return [address.ligne1, address.ligne2, address.codePostal, address.ville, address.pays]
    .map(normalized)
    .join("|");
}

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}
