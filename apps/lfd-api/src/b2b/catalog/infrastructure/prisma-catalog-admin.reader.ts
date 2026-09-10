import { Injectable } from "@nestjs/common";
import type { CatalogAdminItemView, CatalogAllergenView } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { allergenLabelsOf } from "./allergen-labels.js";
import { STILL_SOLD } from "./sellable-filter.js";
import { CatalogAdminReader } from "../domain/ports/catalog-admin.reader.js";

/** La ligne rendue par Prisma, famille et décision jointes. */
interface AdminRow {
  readonly sku: string;
  readonly productSku: string;
  readonly name: string;
  readonly priceMillicents: number;
  readonly vatRatePercent: { toNumber: () => number } | null;
  readonly allergens: unknown;
  readonly allergenLabels: unknown;
  readonly receivedAt: Date;
  // Le taux de la FAMILLE n'y figure plus : plus rien ici ne le lit. Le laisser
  // dans la forme suffirait à ce qu'un jour quelqu'un le relise « puisqu'il est
  // là » — c'est exactement comme ça qu'il est revenu la première fois.
  readonly category: {
    readonly id: string;
    readonly name: string;
  };
  readonly override: {
    readonly priceMillicents: number | null;
    readonly isHidden: boolean;
    readonly isFeatured: boolean;
    readonly decidedBy: string | null;
    readonly decidedAt: Date;
  } | null;
}

@Injectable()
export class PrismaCatalogAdminReader extends CatalogAdminReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<CatalogAdminItemView[]> {
    const rows = await this.prisma.catalogItem.findMany({
      // Les retirés dehors, comme partout ailleurs — et ici ça compte deux fois :
      // c'est cette lecture que le contrôle de parité prend pour miroir, et un
      // article retiré y apparaîtrait comme un écart avec le référentiel qui ne
      // l'envoie plus.
      where: { ...STILL_SOLD },
      include: { category: true, override: true },
      // 🔴 `sku` DÉPARTAGE, et ce n'est pas de la coquetterie : le référentiel
      // envoie `position: 0` sur **tous** les articles (vérifié le 2026-09-10 —
      // dix-neuf viennoiseries, dix-neuf zéros). Les deux premiers critères sont
      // donc à égalité sur tout un rayon, et Postgres rend alors l'ordre qu'il
      // veut : celui du tas, qui change dès qu'une ligne est réécrite. Poser un
      // prix faisait SAUTER l'article qu'on venait d'éditer.
      //
      // Le départage tient que `position` finisse garni ou non : un tri à
      // égalités n'est pas un tri.
      orderBy: [{ category: { position: "asc" } }, { position: "asc" }, { sku: "asc" }],
    });
    return rows.map(toView);
  }
}

/**
 * Rend **les deux prix**, jamais le seul résultat.
 *
 * Un écran qui ne verrait que le prix effectif ne pourrait ni dire « celui-là,
 * c'est nous qui l'avons posé », ni proposer d'y renoncer — et un prix sans
 * provenance ne se défend pas devant un client qui le conteste.
 */
function toView(row: AdminRow): CatalogAdminItemView {
  const b2bPriceMillicents = row.override?.priceMillicents ?? null;
  return {
    sku: row.sku,
    productSku: row.productSku,
    name: row.name,
    categoryId: row.category.id,
    categoryName: row.category.name,
    pimPriceMillicents: row.priceMillicents,
    b2bPriceMillicents,
    effectivePriceMillicents: b2bPriceMillicents ?? row.priceMillicents,
    // Le taux de L'ARTICLE, et lui seul — **exactement ce que la boutique
    // facture**. C'est toute la raison d'être de cette ligne : l'écran lisait
    // celui de la FAMILLE et affichait donc un taux que la caisse n'appliquait
    // pas.
    //
    // 🔴 Le repli sur la famille est parti avec celui du lecteur de vente, le
    // 2026-09-06, et il fallait qu'ils partent ENSEMBLE. En retirer un seul
    // aurait rouvert la divergence que ce commentaire décrit, dans un sens ou
    // dans l'autre : un écran qui montre un taux que la caisse ignore, ou une
    // caisse qui facture un taux que l'écran ne montre pas.
    //
    // Ce qui en découle est le gain du lot : `null` remonte enfin jusqu'à
    // l'écran, et son compteur « des articles ne sont pas vendables » cesse
    // d'être aveugle aux lignes que le repli couvrait.
    vatRatePercent: row.vatRatePercent?.toNumber() ?? null,
    ...allergensOf(row.allergens, row.allergenLabels),
    isHidden: row.override?.isHidden ?? false,
    isFeatured: row.override?.isFeatured ?? false,
    decidedBy: row.override?.decidedBy ?? null,
    decidedAt: row.override?.decidedAt.toISOString() ?? null,
    receivedAt: row.receivedAt.toISOString(),
  };
}

/**
 * **Ce que le PIM a projeté**, rendu à l'écran — et l'aveu que la liste peut
 * être amputée.
 *
 * ⚠️ Cette fonction RECALCULAIT les mentions, jusqu'au 2026-09-03, en appelant
 * `findMapping` et `toInco` — c'est-à-dire une table de 30 codes **figée dans le
 * TypeScript**. Pendant ce temps, la boutique lisait ce que le PIM avait projeté
 * depuis le référentiel **administrable en base**. Deux sources pour la même
 * affirmation réglementaire, et le back-office lisait la mauvaise :
 *
 * - le référentiel est **administrable**, et le runbook recommande de créer des
 *   **entrées maison** (`official = false`) que la table figée ne connaîtra
 *   jamais. Un article en déclarant une s'affiche correctement en boutique et
 *   **« fiche incomplète »** en rouge au back-office : l'écran accuse d'un oubli
 *   causé par une table que le staff n'a pas le droit de modifier. C'est un
 *   écart de MÉCANISME, pas un incident constaté — mais il ne demande qu'une
 *   entrée maison pour devenir réel, et c'est le geste normal ;
 * - le libellé lui-même divergeait — le nom de la catégorie en base d'un côté,
 *   un `INCO_LABELS` gelé de l'autre.
 *
 * La plateforme n'a **plus** le référentiel réglementaire (D6) : elle subit les
 * mentions comme le reste du fil. C'est ce que `catalog_items.allergen_labels`
 * porte, et c'est désormais tout ce que cette fonction lit.
 *
 * Exportée pour le test : les quatre états ne se prouvent pas à travers Prisma.
 */
export function allergensOf(
  rawCodes: unknown,
  rawLabels: unknown,
): {
  allergens: readonly CatalogAllergenView[] | null;
  allergensIncomplete: boolean;
} {
  if (!Array.isArray(rawCodes)) {
    // Pas de fiche déclarée. Surtout pas `[]`, qui affirmerait « aucun ».
    return { allergens: null, allergensIncomplete: false };
  }
  const projected = allergenLabelsOf(rawLabels);
  if (projected === null) {
    // **Une fiche existe, et on ne sait pas la rendre.** C'est l'article reçu
    // avant la v5 du fil, que seul un push complet garnira. `[]` dit « fiche
    // déclarée » et le drapeau dit « ce que tu vois est amputé » : ensemble, ils
    // interdisent au gabarit d'écrire « Sans allergène », qui serait le seul
    // mensonge possible ici.
    return { allergens: [], allergensIncomplete: true };
  }
  return {
    allergens: projected.labels.map((label) => ({
      category: label.category,
      label: label.label,
    })),
    allergensIncomplete: projected.incomplete,
  };
}
