import type { ImagePalette, PaletteSwatch } from "../value-objects/image-palette.js";
import { mergePalettes } from "./merge-palettes.js";

/** Une image telle que la frise la lit : son URL, sa date retenue, ses couleurs. */
export interface StripImage {
  readonly url: string;
  /** Prise de vue (jour de sa série, à minuit à Paris), dépôt à défaut. */
  readonly takenAt: Date;
  readonly palette: ImagePalette | null;
}

export interface StripColumn {
  readonly from: Date;
  readonly to: Date;
  readonly count: number;
  /** Vide si aucune image de la colonne n'est peinte. */
  readonly palette: PaletteSwatch[];
  readonly sampleUrl: string;
}

export interface PaletteStrip {
  readonly columns: readonly StripColumn[];
  readonly total: number;
  readonly unpainted: number;
}

/**
 * **Découpe le fonds en colonnes de frise** — fonction pure.
 *
 * Les images arrivent DANS L'ORDRE chronologique ; elles sont partagées en au
 * plus `columns` tranches consécutives de même effectif (à une image près) :
 * des quantiles par RANG, pas par durée, sans quoi les mois sans photo
 * gaspilleraient la largeur. Moins d'images que de colonnes : une par image.
 *
 * L'aperçu est la première image PEINTE de la tranche — celle dont la couleur
 * participe à ce qu'on voit — ou la première tout court si aucune ne l'est.
 */
export function paletteStrip(images: readonly StripImage[], columns: number): PaletteStrip {
  const total = images.length;
  const count = Math.min(Math.max(Math.trunc(columns), 1), total);
  const builders: ColumnBuilder[] = [];
  images.forEach((image, rank) => {
    // La plus grande colonne c telle que ⌊c·total/count⌋ ≤ rank.
    const column = Math.floor(((rank + 1) * count - 1) / total);
    const builder = builders[column];
    if (builder === undefined) {
      builders[column] = { first: image, last: image, count: 1, painted: paintedOf(image) };
    } else {
      builder.last = image;
      builder.count += 1;
      builder.painted.push(...paintedOf(image));
    }
  });
  return {
    columns: builders.map(columnOf),
    total,
    unpainted: images.filter((image) => image.palette === null).length,
  };
}

interface ColumnBuilder {
  readonly first: StripImage;
  last: StripImage;
  count: number;
  readonly painted: { readonly url: string; readonly palette: ImagePalette }[];
}

function paintedOf(image: StripImage): { readonly url: string; readonly palette: ImagePalette }[] {
  return image.palette === null ? [] : [{ url: image.url, palette: image.palette }];
}

function columnOf(builder: ColumnBuilder): StripColumn {
  return {
    from: builder.first.takenAt,
    to: builder.last.takenAt,
    count: builder.count,
    palette: mergePalettes(builder.painted.map((image) => image.palette)),
    sampleUrl: (builder.painted[0] ?? builder.first).url,
  };
}
