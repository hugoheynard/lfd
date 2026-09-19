import { z } from "zod";

import { count, fact, instant, payload, ref, type JournalFactFamily } from "./fact.js";

/**
 * **La tarification négociée** — règles, limites, barèmes, mercuriales et
 * engagements de volume.
 *
 * Les actes (`price_rule.*`, `price_floor.*`, `volume_ladder.*`,
 * `company_mercuriale.*`) sont le **miroir** du journal du domaine
 * (`public.pricing_events`), écrit par `PricingActWriter` : sujet × verbe,
 * avec une charge unique — la phrase figée au moment de l'acte, et le motif.
 * Seules les combinaisons réellement écrites figurent ici.
 */

/** Ce que le miroir général retient d'un acte tarifaire. */
const act = () =>
  payload({
    /** La phrase figée de ce que la décision disait, au moment de l'acte. */
    summary: z.string(),
    /** Ce que l'auteur a écrit, quand l'écran le lui a demandé. */
    reason: z.string().nullable(),
  });

export const PRICING_FACTS = {
  "price_rule.posed": fact(act()),
  "price_rule.paused": fact(act()),
  "price_rule.resumed": fact(act()),
  "price_rule.archived": fact(act()),
  "price_rule.renamed": fact(act()),

  /** Le sujet est la PORTÉE de la limite, pas sa version. */
  "price_floor.posed": fact(act()),
  "price_floor.replaced": fact(act()),
  "price_floor.archived": fact(act()),
  "price_floor.confirmed": fact(act()),

  "volume_ladder.posed": fact(act()),
  "volume_ladder.paused": fact(act()),
  "volume_ladder.resumed": fact(act()),
  "volume_ladder.archived": fact(act()),

  "company_mercuriale.posed": fact(act()),
  "company_mercuriale.archived": fact(act()),
  "company_mercuriale.renamed": fact(act()),

  /** Les termes entiers de l'engagement. */
  "volume_commitment.signed": fact(
    payload({
      companyId: ref("company"),
      scope: z.enum(["global", "category", "product", "variant"]),
      /** `null` pour la portée `global`. */
      scopeId: z.string().nullable(),
      promisedQuantity: count(),
      validFrom: instant(),
      validTo: instant(),
    }),
  ),
  "volume_commitment.closed": fact(payload({ reason: z.string().nullable() })),
} as const satisfies JournalFactFamily;
