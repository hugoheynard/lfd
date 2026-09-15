/**
 * SIRET lisible par groupes — il arrive du backend en 14 chiffres. Pur ;
 * partagé par les fiches société des deux frontends B2B.
 */
export function formatSiret(siret: string): string {
  if (siret.length !== 14) {
    return siret;
  }
  return `${siret.slice(0, 3)} ${siret.slice(3, 6)} ${siret.slice(6, 9)} ${siret.slice(9)}`;
}

/** SIREN lisible par groupes de trois — il arrive du backend en 9 chiffres. */
export function formatSiren(siren: string): string {
  if (siren.length !== 9) {
    return siren;
  }
  return `${siren.slice(0, 3)} ${siren.slice(3, 6)} ${siren.slice(6)}`;
}
