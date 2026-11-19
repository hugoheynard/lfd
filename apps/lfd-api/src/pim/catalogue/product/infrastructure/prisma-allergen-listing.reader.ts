import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { readLocalizedColumn, readStringArrayColumn } from "../../../shared/json-readers.js";
import {
  AllergenListingReader,
  type AllergenListedProduct,
  type AllergenListedVariant,
} from "../domain/ports/allergen-listing.reader.js";
import { isLiveStatus } from "../domain/ports/product.repository.js";
import { alignedAllergenSheet } from "../domain/services/aligned-allergen-sheet.js";

/** Les colonnes lues d'une déclinaison — rien de plus. */
const LISTED_VARIANT_SELECT = {
  id: true,
  sku: true,
  name: true,
  position: true,
  isDefault: true,
  isDiscontinued: true,
  regulatoryFollowsDefault: true,
  allergenSheet: { select: { allergens: true, mayContain: true } },
} as const;

/**
 * Les fiches en type ALLÉGÉ, en une requête : nom, statut, famille,
 * déclinaisons et leurs allergènes — ni nutrition, ni TVA de contexte, que
 * l'agrégat chargerait pour rien. L'alignement sur le défaut reste résolu par
 * la règle du domaine (`alignedAllergenSheet`), jamais réécrit ici.
 */
@Injectable()
export class PrismaAllergenListingReader extends AllergenListingReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async liveProducts(): Promise<readonly AllergenListedProduct[]> {
    const rows = await this.prisma.product.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        categoryId: true,
        variants: { orderBy: { position: "asc" }, select: LISTED_VARIANT_SELECT },
      },
      orderBy: { sku: "asc" },
    });
    return rows
      .filter((row) => isLiveStatus(row.status))
      .map((row) => ({
        id: row.id,
        name: readLocalizedColumn(row.name, "product.name"),
        status: row.status,
        categoryId: row.categoryId,
        variants: resolvedVariants(row.variants.map(toReadVariant)),
      }));
  }
}

/** Une déclinaison lue, avant la résolution de l'alignement. */
interface ReadVariant extends AllergenListedVariant {
  readonly isDefault: boolean;
  readonly regulatoryFollowsDefault: boolean;
}

function toReadVariant(row: {
  readonly id: string;
  readonly sku: string;
  readonly name: unknown;
  readonly position: number;
  readonly isDefault: boolean;
  readonly isDiscontinued: boolean;
  readonly regulatoryFollowsDefault: boolean;
  readonly allergenSheet: { readonly allergens: unknown; readonly mayContain: unknown } | null;
}): ReadVariant {
  return {
    id: row.id,
    sku: row.sku,
    name: readLocalizedColumn(row.name, "variant.name"),
    position: row.position,
    isDefault: row.isDefault,
    isDiscontinued: row.isDiscontinued,
    regulatoryFollowsDefault: row.regulatoryFollowsDefault,
    // Pas de ligne = personne n'a déclaré ; une ligne, même vide, est une affirmation.
    allergenSheet:
      row.allergenSheet === null
        ? null
        : {
            declared: readStringArrayColumn(
              row.allergenSheet.allergens,
              "variant_allergens.allergens",
            ),
            mayContain: readStringArrayColumn(
              row.allergenSheet.mayContain,
              "variant_allergens.may_contain",
            ),
          },
  };
}

/** Une déclinaison alignée prend les allergènes du défaut — la règle de l'agrégat. */
function resolvedVariants(variants: readonly ReadVariant[]): AllergenListedVariant[] {
  const defaultVariant = variants.find((variant) => variant.isDefault);
  return variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    name: variant.name,
    position: variant.position,
    isDiscontinued: variant.isDiscontinued,
    allergenSheet:
      defaultVariant === undefined
        ? variant.allergenSheet
        : alignedAllergenSheet(variant, defaultVariant),
  }));
}
