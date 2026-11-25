import { z } from "zod";

import { count, day, fact, payload, subjectLabel } from "./fact.js";

/**
 * **Les étapes d'une ligne du fournil** (
 * `documentation/fournil/un-produit-sur-plusieurs-postes.md`, § 2.3) : un
 * poste qui ne finit pas le produit coche sa part, la met en rouge, ou la
 * décoche. Une étape ne compte aucune pièce : seul « Fait » du poste qui
 * finit en déclare.
 *
 * Le sujet est l'étape (`production_line_step`,
 * `<jour>:<sku>:<poste>`) ; son libellé est le nom du produit.
 * `version` monte à chaque geste qui change l'étape.
 */
const stepPayload = {
  subjectLabel: subjectLabel(),
  serviceDay: day(),
  sku: z.string().min(1),
  workstationId: z.string().min(1),
  /** Le nom du poste au moment du geste. */
  workstationName: z.string().min(1),
  version: count(),
};

export const PRODUCTION_LINE_STEP_FACTS = {
  /** L'étape est faite. */
  "production_line.step_done": fact(payload(stepPayload)),
  /** L'étape est en rouge, avec sa raison si on en a donné une ; aucun plafond. */
  "production_line.step_red": fact(
    payload({ ...stepPayload, reason: z.string().min(1).nullable() }),
  ),
  /** L'étape est décochée : elle attend de nouveau. */
  "production_line.step_undone": fact(payload(stepPayload)),
};
