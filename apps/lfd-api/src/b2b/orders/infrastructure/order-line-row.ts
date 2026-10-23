import {
  commitmentDecisionSchema,
  floorDecisionSchema,
  orderLineAllergensSchema,
  priceStepsSchema,
  rejectedRulesSchema,
  type OrderLineAllergens,
  type OrderLinePricingTrace,
} from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";

// Sortis de `prisma-order.reader.ts` le 2026-10-23 : la révision d'une
// commande relit ses lignes figées par les MÊMES parseurs (plan
// `plan-modifier-une-commande.md`, M1) — une seconde lecture de la trace
// aurait fini par la lire autrement.

/** Une ligne de commande telle que Prisma la sélectionne. */
export interface OrderLineRow {
  readonly sku: string;
  readonly productNameSnapshot: string;
  readonly unitPriceMillicents: number;
  readonly vatRate: { toNumber(): number };
  readonly quantity: number;
  readonly lineTotalCents: number;
  readonly unitPriceTtcCents: number | null;
  readonly lineTotalTtcCents: number | null;
  readonly basePriceMillicents: number | null;
  readonly pricingSteps: Prisma.JsonValue | null;
  readonly pricingFloored: boolean | null;
  readonly pricingClampedToZero: boolean | null;
  readonly pricingFloor: Prisma.JsonValue | null;
  readonly allergens: Prisma.JsonValue | null;
  readonly pricingCommitment: Prisma.JsonValue | null;
  readonly pricingRejected: Prisma.JsonValue | null;
  readonly pickupDiscountEligible: boolean;
}

/**
 * Les allergènes figés, **validés** plutôt que castés — et une forme illisible
 * rend `null`, jamais `[]`.
 *
 * C'est le même arbitrage que la trace de prix, avec un enjeu qui n'est pas le
 * même : une facture doit rester consultable même si l'explication de son prix
 * ne l'est plus. Ici, retomber sur une liste vide ferait AFFIRMER « aucun
 * allergène » sur une commande dont on ne sait plus rien — la seule affirmation
 * que ce dépôt ne doit jamais fabriquer.
 */
export function parseAllergens(value: Prisma.JsonValue | null): OrderLineAllergens | null {
  if (value === null) {
    return null;
  }
  const parsed = orderLineAllergensSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * La trace, **validée** plutôt que castée.
 *
 * Elle a été écrite en JSON par une version du code ; elle est relue par une
 * autre, des mois plus tard. Zod est la seule barrière entre les deux — et une
 * trace illisible rend `null` (« on ne sait pas ») au lieu de lever : une
 * facture doit rester consultable même si l'explication de son prix ne l'est
 * plus. C'est l'inverse de l'arbitrage fait sur les RÈGLES, et pour une raison
 * nette : là-bas une donnée illisible ferait FACTURER un prix que personne n'a
 * décidé ; ici elle empêche seulement de commenter un prix déjà facturé.
 */
export function parseTrace(line: OrderLineRow): OrderLinePricingTrace | null {
  if (line.basePriceMillicents === null || line.pricingFloored === null) {
    return null;
  }
  const steps = priceStepsSchema.safeParse(line.pricingSteps);
  if (!steps.success) {
    return null;
  }
  return {
    basePriceMillicents: line.basePriceMillicents,
    steps: steps.data,
    floored: line.pricingFloored,
    // `null` traverse tel quel : « on ne sait pas » n'est pas « ça n'est pas
    // arrivé », et le réduire à `false` affirmerait quelque chose sur les
    // seules commandes qu'on ne peut plus vérifier.
    clampedToZero: line.pricingClampedToZero,
    // Une décision illisible rend `null` sans emporter le reste de la trace : le
    // détail des étages reste consultable, on perd seulement le commentaire du
    // plancher.
    floorDecision: floorDecisionSchema.safeParse(line.pricingFloor).data ?? null,
    // Même indulgence, même raison : l'engagement explique un palier, il ne le
    // refait pas. Illisible, on perd l'explication, pas la commande.
    commitment: commitmentDecisionSchema.safeParse(line.pricingCommitment).data ?? null,
    // **Même indulgence, et il faut la dire** : une entrée illisible ne fait
    // perdre que le commentaire, jamais la commande. `null` couvre donc deux
    // cas — la ligne d'avant la colonne, et la valeur qu'on ne sait plus lire —
    // et les deux se traitent pareil à l'écran : on se tait. Un `[]` de repli
    // affirmerait « le moteur n'a écarté personne », ce qui est exactement la
    // phrase qu'on ne doit pas fabriquer (R25).
    rejected: rejectedRulesSchema.safeParse(line.pricingRejected).data ?? null,
  };
}
