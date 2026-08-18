import type { PriceTemplateView, TemplateLinePayload } from '@lfd/contracts';

/**
 * **Le brouillon d'une grille, côté écran.**
 *
 * Les prix y vivent en **chaînes** et non en centimes, et c'est délibéré : un
 * champ qu'on vide doit pouvoir rester vide le temps qu'on tape le nombre
 * suivant. Convertir à chaque frappe rendait « 0, » en zéro, puis remettait
 * « 0 » dans le champ sous les doigts.
 *
 * La conversion se fait donc **une fois**, à l'envoi, et ce qui ne se lit pas
 * est refusé là plutôt que corrigé en silence.
 */
export interface DraftTier {
  readonly minQuantity: string;
  readonly unitPrice: string;
}

export interface DraftLine {
  readonly sku: string;
  readonly productName: string;
  readonly catalogPriceCents: number | null;
  readonly tiers: readonly DraftTier[];
}

/** Un prix en euros saisi à la main → des centimes. `null` si illisible. */
export function centsOf(raw: string): number | null {
  const parsed = Number.parseFloat(raw.replace(',', '.'));
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

/** Une quantité saisie à la main. `null` si illisible ou nulle. */
export function quantityOf(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

/** Les euros d'un montant en centimes, pour préremplir un champ. */
export function eurosField(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Le brouillon → la charge utile, ou `null` si une saisie ne se lit pas.
 *
 * **Refuse plutôt que corrige** : une ligne dont le prix est illisible ne part
 * pas à zéro. Un zéro est un prix réel dans ce modèle (l'article offert), donc
 * le fabriquer à partir d'une frappe ratée poserait un prix que personne n'a
 * voulu — et il partirait chez un client.
 *
 * Les lignes **sans aucun palier lisible sont écartées** : c'est le cas normal
 * de l'article qu'on a ajouté puis renoncé à tarifer, et l'écarter vaut mieux
 * que d'interdire d'enregistrer tout le reste.
 */
export function toPayloadLines(lines: readonly DraftLine[]): TemplateLinePayload[] | null {
  const built: TemplateLinePayload[] = [];
  for (const line of lines) {
    const tiers = line.tiers.flatMap((tier) => {
      const minQuantity = quantityOf(tier.minQuantity);
      const unitPriceCents = centsOf(tier.unitPrice);
      // Un palier entièrement vide est un ajout qu'on n'a pas rempli : il
      // s'oublie. Un palier à moitié rempli est une faute de frappe : il bloque.
      if (tier.minQuantity.trim() === '' && tier.unitPrice.trim() === '') {
        return [];
      }
      if (minQuantity === null || unitPriceCents === null) {
        return [null];
      }
      return [{ minQuantity, unitPriceCents }];
    });
    if (tiers.some((tier) => tier === null)) {
      return null;
    }
    const clean = tiers.filter(
      (tier): tier is { minQuantity: number; unitPriceCents: number } => tier !== null,
    );
    if (clean.length > 0) {
      built.push({ sku: line.sku, tiers: clean });
    }
  }
  return built.length === 0 ? null : built;
}

/** Une grille existante → son brouillon éditable. */
export function draftFrom(template: PriceTemplateView): DraftLine[] {
  return template.lines.map((line) => ({
    sku: line.sku,
    productName: line.productName,
    catalogPriceCents: line.catalogPriceCents,
    tiers: line.tiers.map((tier) => ({
      minQuantity: String(tier.minQuantity),
      unitPrice: eurosField(tier.unitPriceCents),
    })),
  }));
}
