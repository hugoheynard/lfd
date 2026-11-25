import { z } from "zod";

import { fact, payload, subjectLabel } from "./fact.js";

/**
 * **L'impression d'un bon de livraison** (`documentation/commandes/reliquat/reliquat.md`, § 7) —
 * PDF de transport ou BL chiffré ouvert par l'équipe. Le sujet est la
 * COMMANDE, son libellé son numéro ; qui et quand viennent du contexte.
 * `noteNumber` : le bon (`BL-13-1`) ; `contentVersion` : la version du
 * contenu imprimée — celle que la liste des documents nomme. Le PDF d'une
 * version figée n'est pas une impression et n'écrit rien. 🔴 Type irréversible.
 */
export const DELIVERY_NOTE_PRINT_FACTS = {
  "delivery_note.printed": fact(
    payload({
      subjectLabel: subjectLabel(),
      noteNumber: z.string().min(1),
      contentVersion: z.number().int().min(1),
    }),
  ),
};
