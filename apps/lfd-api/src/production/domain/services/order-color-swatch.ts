import { type Doc, MM } from "../../../platform/pdf/paper-pdf-kit.js";
import { fillBox, strokeBox } from "../../../platform/pdf/paper-pdf-shapes.js";

/** Le côté de la pastille, et l'espace qui la sépare de la référence. */
export const SWATCH_SIZE = 4.5 * MM;
const SWATCH_GAP = 2 * MM;

/**
 * **La pastille d'une commande** sur un papier du fournil (plan
 * `comptabilite/plan-planche-des-documents-v2.md`, §0 bis, Hugo 2026-10-22) :
 * un carré de sa couleur, cerclé de noir pour qu'un jaune pâle se voie sur
 * le blanc — le même dessin que le carré d'arrêt de la feuille de tournée.
 * Aucun mot : pro ou particulier reste porté par la couleur seule.
 *
 * Rend la largeur occupée, pour décaler ce qui suit ; `0` sans couleur :
 * rien n'est dessiné, jamais une teinte devinée.
 */
export function drawOrderSwatch(doc: Doc, color: string | null, x: number, y: number): number {
  if (color === null) {
    return 0;
  }
  const box = { x, y, width: SWATCH_SIZE, height: SWATCH_SIZE };
  fillBox(doc, box, color);
  strokeBox(doc, box, 0.6);
  return SWATCH_SIZE + SWATCH_GAP;
}
