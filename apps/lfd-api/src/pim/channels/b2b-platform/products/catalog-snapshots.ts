import type { CatalogFamilyFactBody, CatalogProductFactBody } from "./catalog-facts.js";

/**
 * **Ce qu'une fiche ou une famille est devenue**, relu et projeté — le port
 * que l'émetteur lit après son verrou.
 *
 * Un port plutôt que la classe concrète : l'émetteur tient l'ORDRE (verrou,
 * numéro, boîte d'envoi), et s'éprouve sans les sept lectures qui fabriquent
 * un instantané.
 */
export abstract class CatalogSnapshots {
  /** L'instantané de chaque fiche trouvée, par identifiant ; les inconnues n'ont pas d'entrée. */
  abstract products(ids: readonly string[]): Promise<ReadonlyMap<string, CatalogProductFactBody>>;
  /** L'instantané de chaque famille trouvée, par identifiant. */
  abstract families(ids: readonly string[]): Promise<ReadonlyMap<string, CatalogFamilyFactBody>>;
}
