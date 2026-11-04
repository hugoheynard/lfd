/**
 * **Purger le rayon public de Workers Cache** (`plan-cache-du-catalogue.md`,
 * § 5) : l'étiquette `rayon-public`, partout. Seul le Worker de l'API peut le
 * faire — le conteneur le lui demande par le chemin interne.
 *
 * Un adaptateur peut lever ou tarder : on ne l'appelle qu'à travers
 * `ResilientPublicShelf`, et la durée de 30 s rattrape une purge perdue.
 */
export abstract class PublicShelfEraser {
  abstract purge(): Promise<void>;
}
