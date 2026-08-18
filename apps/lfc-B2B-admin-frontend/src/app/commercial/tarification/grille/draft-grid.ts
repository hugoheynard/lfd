import type { TemplateLinePayload, TemplateTierPayload } from '@lfd/contracts';

import { centsOf, eurosField } from './price-field';

/** Les paliers saisis pour un article — en chaînes, cf. `price-field`. */
export interface DraftTier {
  readonly minQuantity: string;
  readonly unitPrice: string;
}

/** La grille en cours de saisie : par SKU. Absent = article non tarifé. */
export type DraftGrid = ReadonlyMap<string, readonly DraftTier[]>;

/**
 * **Les transformations de la grille**, pures et hors du composant.
 *
 * Chacune rend une NOUVELLE carte plutôt que de muter : c'est ce qui permet au
 * signal de la page de se comparer, et donc à la grille `OnPush` de ne
 * redessiner que lorsqu'elle a changé.
 */
export function withTiers(grid: DraftGrid, sku: string, tiers: readonly DraftTier[]): DraftGrid {
  const next = new Map(grid);
  next.set(sku, tiers);
  return next;
}

export function without(grid: DraftGrid, sku: string): DraftGrid {
  const next = new Map(grid);
  next.delete(sku);
  return next;
}

export function tiersOf(grid: DraftGrid, sku: string): readonly DraftTier[] {
  return grid.get(sku) ?? [];
}

/**
 * **Tarifer un article** : un palier à partir de 1, préparé au tarif catalogue.
 *
 * C'est déjà un prix fixe — le prix fixe n'est pas un mode, c'est la grille à un
 * palier. Partir du catalogue plutôt que du vide : une mercuriale se négocie en
 * descendant depuis un prix connu.
 */
export function priceAt(grid: DraftGrid, sku: string, unitPrice: string): DraftGrid {
  return withTiers(grid, sku, [{ minQuantity: '1', unitPrice }]);
}

/** Un palier de plus : le seul geste qui fait passer d'un prix fixe à une grille. */
export function addTier(grid: DraftGrid, sku: string): DraftGrid {
  return withTiers(grid, sku, [...tiersOf(grid, sku), { minQuantity: '', unitPrice: '' }]);
}

export function removeTier(grid: DraftGrid, sku: string, index: number): DraftGrid {
  return withTiers(
    grid,
    sku,
    tiersOf(grid, sku).filter((_, position) => position !== index),
  );
}

export function setTierField(
  grid: DraftGrid,
  sku: string,
  index: number,
  field: 'minQuantity' | 'unitPrice',
  value: string,
): DraftGrid {
  return withTiers(
    grid,
    sku,
    tiersOf(grid, sku).map((tier, position) =>
      position === index ? { ...tier, [field]: value } : tier,
    ),
  );
}

/** Le prix d'entrée saisi pour un article, en centimes. `null` si illisible. */
export function entryOf(grid: DraftGrid, sku: string): number | null {
  const first = tiersOf(grid, sku)[0];
  return first === undefined ? null : centsOf(first.unitPrice);
}

/**
 * **La grille → ce qui part au serveur.**
 *
 * Un palier **entièrement vide** s'oublie : c'est l'ajout qu'on n'a pas rempli.
 * Un palier **à moitié rempli** fait tomber sa ligne — c'est une faute de frappe,
 * et zéro est un prix réel ici : le compléter d'office poserait un prix que
 * personne n'a voulu, chez un client.
 *
 * Les autres refus (grille qui monte, doublons de seuil) restent au **serveur** :
 * ils valent aussi pour un import et un rattrapage, pas seulement pour cet écran.
 */
export function toLines(grid: DraftGrid, volumes: PlannedVolumes): readonly TemplateLinePayload[] {
  return [...grid].flatMap(([sku, tiers]) => {
    const built = tiers.flatMap((tier) => {
      if (tier.minQuantity.trim() === '' && tier.unitPrice.trim() === '') {
        return [];
      }
      const minQuantity = Number.parseInt(tier.minQuantity, 10);
      const unitPriceCents = centsOf(tier.unitPrice);
      if (Number.isNaN(minQuantity) || minQuantity <= 0 || unitPriceCents === null) {
        return [null];
      }
      return [{ minQuantity, unitPriceCents }];
    });
    return built.length === 0 || built.some((tier) => tier === null)
      ? []
      : [
          {
            sku,
            tiers: built.filter((tier) => tier !== null),
            // Le volume prévu voyage AVEC la grille : il ne change aucun prix,
            // mais sans lui toute simulation serait à ressaisir au rechargement.
            plannedVolume: volumes.get(sku) ?? null,
          },
        ];
  });
}

/**
 * **Un gabarit enregistré → la grille de saisie.** L'inverse exact de `toLines`.
 *
 * Ici et non dans la page : les deux sens de la même traduction se lisent
 * ensemble, et c'est ce qui empêche l'un de dériver de l'autre.
 */
export function draftFromLines(
  lines: readonly { sku: string; tiers: readonly TemplateTierPayload[] }[],
): DraftGrid {
  return new Map(
    lines.map((line): [string, readonly DraftTier[]] => [
      line.sku,
      line.tiers.map((tier) => ({
        minQuantity: String(tier.minQuantity),
        unitPrice: eurosField(tier.unitPriceCents),
      })),
    ]),
  );
}

/** Les volumes prévus, par SKU. Absent = article hors du plan, et non « zéro ». */
export type PlannedVolumes = ReadonlyMap<string, number>;

/**
 * Un volume saisi. **Vide ou illisible retire l'article du plan** plutôt que de
 * le compter à zéro : les deux se ressemblent dans un total, mais seul le
 * premier est honnête — un article sans volume n'a pas de chiffre, il n'en a pas
 * un nul.
 */
export function withVolume(volumes: PlannedVolumes, sku: string, raw: string): PlannedVolumes {
  const next = new Map(volumes);
  const parsed = Number.parseInt(raw.replace(/\s/gu, ''), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    next.delete(sku);
  } else {
    next.set(sku, parsed);
  }
  return next;
}

export function volumeOf(volumes: PlannedVolumes, sku: string): number {
  return volumes.get(sku) ?? 0;
}

/** Les volumes d'un gabarit enregistré — l'inverse de ce que `toLines` écrit. */
export function volumesFromLines(
  lines: readonly { sku: string; plannedVolume: number | null }[],
): PlannedVolumes {
  return new Map(
    lines
      .filter((line) => line.plannedVolume !== null && line.plannedVolume >= 1)
      .map((line) => [line.sku, line.plannedVolume ?? 0]),
  );
}
