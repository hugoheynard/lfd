import type { Buffer } from "node:buffer";

/**
 * **Le logo de la marque, prêt à s'imprimer** — octets PNG en noir et blanc,
 * en tête des papiers que l'API rend (bon de commande, matrice des
 * allergènes).
 *
 * Un port de `platform/` et non d'un contexte (plan
 * `documentation/pim/plan-matrice-des-allergenes.md`, §2) : le référentiel et
 * le commerce impriment le même logo, et `pim → b2b` est fermé. Le rendu
 * reste pur, l'adaptateur sait où vit le fichier.
 */
export abstract class BrandLogoSource {
  /** @throws {BrandLogoUnavailableError} le fichier manque ou ne se lit pas. */
  abstract load(): Promise<Buffer>;
}
