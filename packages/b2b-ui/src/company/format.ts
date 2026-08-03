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
