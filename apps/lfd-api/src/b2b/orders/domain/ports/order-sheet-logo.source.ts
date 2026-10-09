import type { Buffer } from "node:buffer";

/**
 * **Le logo imprimé en tête du bon de commande** (plan
 * `documentation/order/plan-bon-public.md`, §2.1), en octets PNG.
 *
 * Un port, et pas un chemin écrit dans le rendu : le rendu reste pur et
 * déterministe, l'adaptateur sait où vit le fichier. Même geste que les
 * polices de la facture (`InvoiceFontSource`).
 */
export abstract class OrderSheetLogoSource {
  /** @throws {OrderSheetLogoUnavailableError} le fichier manque ou ne se lit pas. */
  abstract load(): Promise<Buffer>;
}
