import { z } from "zod";

import { fact, instant, payload, subjectLabel } from "./fact.js";

/**
 * **Les pièces d'une remise à la porte, effacées** (2026-10-01,
 * `documentation/livraisons/todo-la-porte.md`, « Les pièces de remise :
 * conservées sans limite, purgeables »).
 *
 * Même famille que la livraison (« commandes et production »). Le sujet est la
 * COMMANDE ; son libellé, son numéro — absent quand le commerce ne la connaît
 * plus. 🔴 Aucune donnée personnelle : ni le nom du réceptionnaire, ni les
 * clés d'image. Le fait dit QU'une pièce a existé et qu'elle n'est plus :
 * quand elle avait été prise, si une signature y était jointe, et pourquoi
 * elle est partie — la conservation échue, ou la demande d'une personne.
 */
export const HANDOVER_PROOF_FACTS = {
  "order_handover_proof.erased": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      recordedAt: instant(),
      signed: z.boolean(),
      cause: z.enum(["retention", "request"]),
    }),
  ),
} as const;
