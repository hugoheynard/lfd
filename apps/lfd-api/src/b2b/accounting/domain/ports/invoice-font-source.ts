import type { Buffer } from "node:buffer";

/** Les deux graisses que la facture imprime, en octets TrueType. */
export interface InvoicePdfFonts {
  readonly regular: Buffer;
  readonly bold: Buffer;
}

/**
 * **Les polices embarquées de la facture PDF/A-3** (plan
 * `plan-emission-de-la-facture.md`, E3b).
 *
 * Un port, et pas un chemin écrit dans le rendu : PDF/A interdit une police
 * non embarquée, donc les quatorze polices standard de `pdfkit` (Helvetica…)
 * sont exclues, et le rendu reçoit des octets plutôt que d'aller les chercher.
 * Le domaine reste pur ; l'adaptateur sait où vivent les fichiers.
 */
export abstract class InvoiceFontSource {
  /** @throws {InvoiceFontsUnavailableError} un fichier manque ou ne se lit pas. */
  abstract load(): Promise<InvoicePdfFonts>;
}
