import type { Buffer } from "node:buffer";

/**
 * **Le logo imprimé en tête du bon de commande** (plan
 * `documentation/commandes/bon-et-pieces/architecture-bon-de-commande.md`, §2.1), en octets PNG.
 *
 * Branché sur `BrandLogoSource` (`platform/brand`, 2026-10-20) : le commerce
 * garde son vocabulaire, la marque n'a qu'un lecteur.
 *
 * Un port, et pas un chemin écrit dans le rendu : le rendu reste pur et
 * déterministe, l'adaptateur sait où vit le fichier. Même geste que les
 * polices de la facture (`InvoiceFontSource`).
 */
export abstract class OrderSheetLogoSource {
  /** @throws {BrandLogoUnavailableError} le fichier manque ou ne se lit pas. */
  abstract load(): Promise<Buffer>;
}
