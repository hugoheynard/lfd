import { Prisma } from "../../../platform/database/client/client.js";
import type { OrderLineSnapshot } from "../domain/value-objects/order-line.js";
import { jsonSteps } from "./order-json.js";

/**
 * **Une ligne de commande, telle qu'elle s'écrit** — sortie de
 * `PrismaOrderRepository.place` le 2026-10-23 : la révision d'une commande
 * réécrit ses lignes par la MÊME fonction (plan `plan-modifier-une-commande.md`,
 * M1). Deux écritures de la même ligne finiraient par figer deux choses.
 */
export function orderLineDataOf(line: OrderLineSnapshot): Prisma.OrderLineCreateWithoutOrderInput {
  return {
    sku: line.sku,
    productNameSnapshot: line.productName,
    unitPriceMillicents: line.unitPriceMillicents,
    vatRate: line.vatRate,
    quantity: line.quantity,
    // L'unité de la quantité, figée avec le prix (`vente-au-poids.md`, P3).
    saleUnit: line.saleUnit,
    lineTotalCents: line.lineTotalCents,
    // 🔴 Écrits tels que l'agrégat les a scellés, `null` compris : c'est
    // LUI qui sait si l'acheteur était un particulier, et cette
    // question ne se repose plus jamais après (R3, 2026-09-21).
    unitPriceTtcCents: line.unitPriceTtcCents,
    lineTotalTtcCents: line.lineTotalTtcCents,
    // Figés par l'agrégat (R2 du plan des exclusions) : la facture
    // lit ce drapeau, jamais la règle du jour.
    pickupDiscountEligible: line.pickupDiscountEligible,
    productId: line.productId,
    categoryId: line.categoryId,
    basePriceMillicents: line.pricing?.basePriceMillicents ?? null,
    // `Prisma.DbNull` et non `null` : sur une colonne JSON nullable,
    // `null` désigne le *littéral* JSON `null`, pas l'absence de valeur.
    // Les deux se relisent différemment, et c'est précisément la
    // distinction qu'on veut tenir ici — absence = commande antérieure.
    pricingSteps: line.pricing === null ? Prisma.DbNull : jsonSteps(line.pricing.steps),
    pricingFloored: line.pricing?.floored ?? null,
    pricingClampedToZero: line.pricing?.clampedToZero ?? null,
    pricingFloor:
      line.pricing?.floorDecision == null ? Prisma.DbNull : { ...line.pricing.floorDecision },
    pricingCommitment:
      line.pricing?.commitment == null ? Prisma.DbNull : { ...line.pricing.commitment },
    // Même `Prisma.DbNull`, et il porte ici les trois états de la
    // colonne : absence = « on ne consignait pas », `[]` = « le moteur
    // n'a écarté personne », valeur = qui et pourquoi. Une ligne neuve
    // écrit toujours l'un des deux derniers.
    pricingRejected:
      line.pricing?.rejected == null
        ? Prisma.DbNull
        : line.pricing.rejected.map((entry) => ({ ...entry, scope: { ...entry.scope } })),
    // Même distinction, et elle porte ici l'enjeu le plus lourd du
    // fichier : `Prisma.DbNull` dit « on ne sait pas », là où un `[]`
    // écrit affirmerait « aucun allergène ». Sur une commande qu'on
    // relira après une réclamation, la seconde phrase est celle qu'on
    // ne doit jamais fabriquer.
    allergens:
      line.allergens === null
        ? Prisma.DbNull
        : {
            codes: line.allergens.codes === null ? null : [...line.allergens.codes],
            labels:
              line.allergens.labels === null
                ? null
                : line.allergens.labels.map((entry) => ({ ...entry })),
            incomplete: line.allergens.incomplete,
          },
  };
}
