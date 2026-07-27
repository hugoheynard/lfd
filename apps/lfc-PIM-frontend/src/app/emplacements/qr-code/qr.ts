import qrcode from 'qrcode-generator';

/** Zone de silence normative (4 modules) — nécessaire à un scan fiable. */
const MARGIN = 4;

export interface QrMatrix {
  /** Côté du dessin, zone de silence comprise. */
  readonly dim: number;
  /** Modules noirs (coordonnées déjà décalées de la marge). */
  readonly dark: readonly { readonly x: number; readonly y: number }[];
}

/** Matrice QR d'une chaîne — partagée par le rendu à l'écran et l'export SVG. */
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

/** SVG autonome (noir sur blanc) prêt à l'export/impression. */
export function qrSvgString(data: string): string {
  const { dim, dark } = qrMatrix(data);
  const modules = dark
    .map((m) => `<rect x="${m.x}" y="${m.y}" width="1" height="1"/>`)
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" ` +
    `shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="#ffffff"/>` +
    `<g fill="#14181f">${modules}</g></svg>`
  );
}
