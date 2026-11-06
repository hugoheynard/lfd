import { deflateSync } from "node:zlib";

/**
 * Un **encodeur PNG minimal** : une grille noir et blanc → les octets d'un PNG.
 *
 * ## Pourquoi l'écrire plutôt que l'installer
 *
 * Le besoin est d'un carré de modules noirs et blancs. Une bibliothèque
 * d'images apporterait la lecture, les palettes, les filtres, l'entrelacement et
 * les formats voisins — pour un QR code. Ici, l'encodeur tient en un IHDR, un
 * IDAT et un IEND, `node:zlib` fournit la compression, et le tout se relit d'un
 * bout à l'autre.
 *
 * ## Pourquoi un PNG et pas autre chose
 *
 * Le QR part **en pièce jointe en ligne** dans un e-mail. Un `data:` URI serait
 * supprimé par Gmail, un SVG n'est pas rendu par la moitié des clients, et un
 * GIF conviendrait mais son encodage est plus retors que celui d'un PNG sans
 * couleur.
 *
 * ## Ce qui rend le rendu DÉTERMINISTE, et pourquoi ça compte
 *
 * Aucune date, aucun identifiant, aucun aléa : deux appels sur la même grille
 * rendent les **mêmes octets**. C'est ce qui permet à un test d'affirmer un
 * contenu, et ce qui évitera qu'un même e-mail relancé porte deux pièces
 * jointes différentes.
 */

/** Table CRC-32 de la norme PNG, calculée une fois. */
const CRC_TABLE: readonly number[] = Array.from({ length: 256 }, (_unused, index) => {
  let c = index;
  for (let bit = 0; bit < 8; bit += 1) {
    c = (c & 1) === 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

/** Un morceau PNG : longueur, type, données, CRC — dans cet ordre, toujours. */
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, crc]);
}

/** La signature PNG : huit octets qui ne veulent rien dire d'autre. */
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Niveaux de gris, 8 bits par pixel, sans entrelacement — le plus simple. */
const GREYSCALE_8_BIT = Buffer.from([8, 0, 0, 0, 0]);

const BLACK = 0x00;
const WHITE = 0xff;

/**
 * Encode une grille carrée de booléens (`true` = module noir) en PNG.
 *
 * `scale` est le nombre de pixels par module et `quiet` la marge en modules.
 * **La marge n'est pas décorative** : la norme QR exige une zone de silence de
 * quatre modules, et sans elle un lecteur perd le code sur un fond clair ou
 * contre un bord de tableau.
 *
 * @throws {RangeError} grille vide, ou échelle/marge négative.
 */
export function greyscalePng(
  grid: readonly (readonly boolean[])[],
  scale: number,
  quiet: number,
): Buffer {
  if (grid.length === 0 || scale < 1 || quiet < 0) {
    throw new RangeError("Grille vide ou cotes invalides.");
  }
  const modules = grid.length;
  const side = (modules + quiet * 2) * scale;

  // Chaque ligne du flux PNG commence par son octet de filtre. `0` = aucun
  // filtre : sur une image de deux couleurs, les filtres ne gagnent rien et
  // rendraient l'encodeur trois fois plus long.
  const raw = Buffer.alloc((side + 1) * side, WHITE);
  for (let y = 0; y < side; y += 1) {
    raw[y * (side + 1)] = 0;
  }
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (grid[row]?.[col] !== true) {
        continue;
      }
      for (let dy = 0; dy < scale; dy += 1) {
        const y = (row + quiet) * scale + dy;
        const start = y * (side + 1) + 1 + (col + quiet) * scale;
        raw.fill(BLACK, start, start + scale);
      }
    }
  }

  const header = Buffer.alloc(8);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", Buffer.concat([header, GREYSCALE_8_BIT])),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
