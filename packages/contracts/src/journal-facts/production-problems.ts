import { z } from "zod";

import { count, day, fact, payload, subjectLabel } from "./fact.js";

/**
 * **Les problèmes du fournil** (
 * `documentation/fournil/les-niveaux-de-suivi.md`) : le rouge
 * d'une ligne et sa prise en charge. Ce qui touche au facturé — des pièces
 * déclarées qui n'ont jamais existé — y laisse une trace complète.
 *
 * Le sujet est le problème (`production_problem`, son id) ; son libellé est
 * le nom du produit.
 */

/** Une fournée corrigée par le rouge : sa remise (= son id) et la part retirée ce jour-là. */
const correctedBatch = () => payload({ batchId: z.string().min(1), corrected: count() });

export const PRODUCTION_PROBLEM_FACTS = {
  /**
   * Le rouge : `expected` (au compte), `output` (ce que les fournées disaient
   * sorti juste avant), `produced` (le sorti déclaré, devenu plafond), les
   * fournées corrigées, `uncorrected` (ce que le rouge n'a pas trouvé à
   * corriger) et `declared` (les pièces ajoutées par une fournée quand le
   * rouge dit plus que sorti). `version` monte à chaque rouge sur la ligne.
   */
  "production_problem.reported": fact(
    payload({
      subjectLabel: subjectLabel(),
      serviceDay: day(),
      sku: z.string().min(1),
      expected: count(),
      output: count(),
      produced: count(),
      reason: z.string().min(1).nullable(),
      version: count(),
      correctedBatches: z.array(correctedBatch()),
      uncorrected: count(),
      declared: count(),
    }),
  ),
  /** Un responsable l'a marqué traité ; le plafond reste. */
  "production_problem.resolved": fact(
    payload({
      subjectLabel: subjectLabel(),
      serviceDay: day(),
      sku: z.string().min(1),
      produced: count(),
      version: count(),
    }),
  ),
};
