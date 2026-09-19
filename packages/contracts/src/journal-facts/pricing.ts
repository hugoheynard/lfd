import { z } from "zod";

import {
  count,
  fact,
  instant,
  named,
  namedOrBare,
  payload,
  ref,
  subjectLabel,
  type JournalFactFamily,
} from "./fact.js";

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

/** Ce que le miroir général retenait d'un acte tarifaire au lot A (9c3c2d35). */
const actV1 = payload({
  /** La phrase figée de ce que la décision disait, au moment de l'acte. */
  summary: z.string(),
  /** Ce que l'auteur a écrit, quand l'écran le lui a demandé. */
  reason: z.string().nullable(),
});

/**
 * Ce qu'il en retient depuis le lot B du plan des phrases (2026-09-19) : le
 * nom du sujet au moment de l'acte (D6) — le libellé de la règle, du barème,
 * de la mercuriale ; la PORTÉE nommée pour une limite, dont elle est le sujet.
 * La phrase, elle, nomme la famille ou l'article visé plutôt que son code.
 */
const act = () => fact(actV1.extend({ subjectLabel: subjectLabel() }), [actV1]);

/**
 * Un acte sur une **règle** : celui d'un acte, plus la société qu'elle vise,
 * nommée au moment de l'acte — présente seulement quand l'audience est une
 * société que l'annuaire nomme. Une règle pour tous ou pour un segment n'a
 * pas de société à citer ; la phrase (`summary`) dit alors laquelle.
 */
const ruleAct = () =>
  fact(actV1.extend({ subjectLabel: subjectLabel(), audience: named("company").optional() }), [
    actV1,
  ]);

/** Les termes d'un engagement, tels que le lot A les écrivait (9c3c2d35). */
const commitmentTermsV1 = {
  companyId: ref("company"),
  scope: z.enum(["global", "category", "product", "variant"]),
  /** `null` pour la portée `global`. */
  scopeId: z.string().nullable(),
  promisedQuantity: count(),
  validFrom: instant(),
  validTo: instant(),
};

export const PRICING_FACTS = {
  "price_rule.posed": ruleAct(),
  "price_rule.paused": ruleAct(),
  "price_rule.resumed": ruleAct(),
  "price_rule.archived": ruleAct(),
  "price_rule.renamed": ruleAct(),

  /** Le sujet est la PORTÉE de la limite, pas sa version. */
  "price_floor.posed": act(),
  "price_floor.replaced": act(),
  "price_floor.archived": act(),
  "price_floor.confirmed": act(),

  "volume_ladder.posed": act(),
  "volume_ladder.paused": act(),
  "volume_ladder.resumed": act(),
  "volume_ladder.archived": act(),

  "company_mercuriale.posed": act(),
  "company_mercuriale.archived": act(),
  "company_mercuriale.renamed": act(),

  /**
   * Les termes entiers de l'engagement. Le sujet est l'engagement ; son nom
   * est celui de la société engagée (`subjectLabel`), et la société est citée
   * nommée (`company`) — ou par son seul id quand l'annuaire ne la connaît
   * pas : aucune clé étrangère n'attache un engagement à une société, et le
   * fait ne s'invente pas de nom (lot B, 2026-09-19).
   */
  "volume_commitment.signed": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      company: namedOrBare("company"),
      scope: commitmentTermsV1.scope,
      scopeId: commitmentTermsV1.scopeId,
      promisedQuantity: count(),
      validFrom: instant(),
      validTo: instant(),
    }),
    [payload(commitmentTermsV1)],
  ),
  /** Le motif de la clôture, et la société engagée — mêmes règles qu'à la signature. */
  "volume_commitment.closed": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      company: namedOrBare("company"),
      reason: z.string().nullable(),
    }),
    [payload({ reason: z.string().nullable() })],
  ),
} as const satisfies JournalFactFamily;
