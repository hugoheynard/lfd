import { z } from "zod";

import { changes, fact, fromTo, payload, subjectLabel, type JournalFactFamily } from "./fact.js";

/**
 * **Les formules** — des groupes d'articles au choix, vendues ensemble
 * (`documentation/formules/plan-les-formules.md`, lot F2a, 2026-10-19).
 * Écrits par les handlers de `b2b/bundles/`, par `publishTraced`. Rangés dans
 * la famille `commerce` : composer une offre est le même métier que la vitrine
 * et les suggestions.
 *
 * Le sujet est la formule (`bundle`), son `subjectId` sa **clé** — elle ne se
 * réemploie jamais ; `subjectLabel` son nom du moment.
 *
 * Ce lot n'a pas de prix : aucun fait n'en porte. La mise en vente viendra
 * avec lui.
 */

/** Un groupe, tel qu'il est écrit : sa clé, son libellé, ses SKU dans l'ordre. */
const group = () => payload({ key: z.string(), label: z.string(), choices: z.array(z.string()) });

/** Le geste nu : la formule seule, nommée. */
const named = () => fact(payload({ subjectLabel: subjectLabel() }));

export const COMMERCE_BUNDLE_FACTS = {
  /** Créée en brouillon : tout ce qu'elle dit à sa naissance. */
  "bundle.created": fact(
    payload({
      subjectLabel: subjectLabel(),
      name: z.string(),
      description: z.string().nullable(),
      // Les trois valeurs des autres faits : le public seul s'écrit aujourd'hui (D4), et
      // l'ouverture aux pros n'aura pas à changer le catalogue.
      audience: z.enum(["pro", "public", "both"]),
      groups: z.array(group()),
    }),
  ),
  /** Nom ou description : le diff seul. */
  "bundle.presentation_edited": fact(
    payload({
      subjectLabel: subjectLabel(),
      changes: changes({ name: z.string(), description: z.string().nullable() }),
    }),
  ),
  /** La composition ENTIÈRE, avant → après : groupes et choix, dans leur ordre. */
  "bundle.composition_saved": fact(
    payload({ subjectLabel: subjectLabel(), groups: fromTo(z.array(group())) }),
  ),
  /** Retirée : elle ne se modifie plus, sa clé reste prise. */
  "bundle.withdrawn": named(),
  /** Remise en brouillon après avoir été retirée. */
  "bundle.returned_to_draft": named(),
} as const satisfies JournalFactFamily;
