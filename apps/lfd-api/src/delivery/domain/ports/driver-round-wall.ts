/**
 * **Le mur du livreur, seul** (`parcours-du-livreur.md`, PL1) — « cette tournée
 * m'est-elle affectée ? », pour les gestes qui réutilisent les commandes et
 * les lectures de l'écran de chargement sans les recopier.
 *
 * Un port à part de `DriverRoundsReader` (ISP) : le chargement n'a que faire
 * de la vue du livreur, et la lire entière pour un booléen coûterait quatre
 * requêtes. 🔴 Le `where` est LE MÊME (`driver_staff_id = staffUserId`) : une
 * tournée absente de « Ma tournée » est absente ici.
 */
export abstract class DriverRoundWall {
  /** Vrai si la tournée existe ET que ce livreur y est affecté. */
  abstract isAssigned(staffUserId: string, roundId: string): Promise<boolean>;
}
