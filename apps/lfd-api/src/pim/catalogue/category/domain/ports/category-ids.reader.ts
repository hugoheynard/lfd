/**
 * **Les identifiants de toutes les familles**, archivées comprises — pour
 * savoir si un rattachement tient, sans charger une seule famille.
 *
 * Port de LECTURE à part (ISP) : `AllCategoriesReader` rend l'instantané
 * complet, et un lecteur qui ne fait que vérifier une existence n'a pas à le
 * payer.
 */
export abstract class CategoryIdsReader {
  abstract allIds(): Promise<ReadonlySet<string>>;
}
