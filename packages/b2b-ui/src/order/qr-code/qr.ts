import qrcode from 'qrcode-generator';

/**
 * Zone de silence normative (4 modules). Ce n'est pas de la marge décorative :
 * sans elle, un lecteur ne trouve pas les bords du code et le scan échoue —
 * d'autant plus sur un écran de téléphone posé sur un comptoir clair.
 */
const MARGIN = 4;

export interface QrMatrix {
  /** Côté du dessin, zone de silence comprise. */
  readonly dim: number;
  /** Modules noirs (coordonnées déjà décalées de la marge). */
  readonly dark: readonly { readonly x: number; readonly y: number }[];
}

/**
 * Matrice QR d'une chaîne. Pure : rend des coordonnées, ne touche pas au DOM —
 * un test peut donc l'inspecter sans navigateur, et le rendu SSR ne s'y casse
 * pas les dents.
 *
 * Niveau de correction `M` (~15 % de redondance) : un QR affiché sur un écran
 * n'a ni pli ni tache, contrairement à une étiquette imprimée ; monter en `Q`
 * ou `H` densifierait les modules pour rien, ce qui nuit au scan à distance.
 */
export function qrMatrix(data: string): QrMatrix {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  const count = qr.getModuleCount();
  const dark: { x: number; y: number }[] = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) {
        dark.push({ x: col + MARGIN, y: row + MARGIN });
      }
    }
  }
  return { dim: count + MARGIN * 2, dark };
}
