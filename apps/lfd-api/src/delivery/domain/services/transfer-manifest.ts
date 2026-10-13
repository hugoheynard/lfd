/**
 * **Le manifeste d'un transfert interne** — « on doit savoir ce qu'on
 * transporte » (décision de Hugo du 2026-10-13, plan du transfert interne,
 * §3). Fonction pure : ni base, ni horloge.
 *
 * Un même transfert porte EN MÊME TEMPS des commandes (retraits au site) et
 * du réassort (la boutique du site, non bâti) : le genre est celui de chaque
 * élément, jamais du transfert. Le manifeste rend donc deux sections, chacune
 * détaillée par élément et totalisée par SKU, et un total tous genres
 * confondus.
 */

/** Ce que contient un élément : un SKU, son libellé figé, une quantité > 0. */
export interface ManifestLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

export type TransferItemKind = "order" | "refill";

/** Le contenu d'un élément du transfert. */
export interface ManifestItem {
  readonly itemId: string;
  readonly kind: TransferItemKind;
  /** La commande ou le réassort — identifiant opaque. */
  readonly subjectId: string;
  readonly lines: readonly ManifestLine[];
}

export interface ManifestSection {
  readonly items: readonly ManifestItem[];
  readonly totals: readonly ManifestLine[];
}

export interface TransferManifest {
  readonly orders: ManifestSection;
  readonly refills: ManifestSection;
  /** Tous genres confondus, par SKU. */
  readonly totals: readonly ManifestLine[];
}

/**
 * Le total par SKU, dans l'ordre de première apparition. Le libellé est le
 * premier rencontré : deux commandes figées à des dates différentes peuvent
 * porter deux noms pour un même SKU, et le manifeste n'en invente pas un
 * troisième.
 */
export function totalsBySku(lines: readonly ManifestLine[]): readonly ManifestLine[] {
  const totals = new Map<string, ManifestLine>();
  for (const line of lines) {
    const found = totals.get(line.sku);
    totals.set(
      line.sku,
      found === undefined ? { ...line } : { ...found, quantity: found.quantity + line.quantity },
    );
  }
  return [...totals.values()];
}

function sectionOf(items: readonly ManifestItem[]): ManifestSection {
  return { items, totals: totalsBySku(items.flatMap((item) => item.lines)) };
}

/** Le manifeste, d'après le contenu de chaque élément. */
export function manifestOf(items: readonly ManifestItem[]): TransferManifest {
  return {
    orders: sectionOf(items.filter((item) => item.kind === "order")),
    refills: sectionOf(items.filter((item) => item.kind === "refill")),
    totals: totalsBySku(items.flatMap((item) => item.lines)),
  };
}
