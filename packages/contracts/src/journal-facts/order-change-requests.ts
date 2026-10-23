import { z } from "zod";

import { count, fact, payload, ref, subjectLabel } from "./fact.js";

/**
 * **Les demandes de modification de commande** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M4, 2026-10-23) :
 * après l'heure limite, le client DEMANDE ; le commerce applique ou refuse.
 *
 * Le sujet est la COMMANDE, son libellé son numéro ; `requestId` désigne la
 * demande de la boîte des demandes clients. Aucune donnée de l'auteur : la
 * demande s'anonymise à douze mois, et un nom recopié ici y survivrait. La
 * composition demandée n'y est pas non plus : appliquée, c'est le fait
 * `order.revised` et l'historique des révisions qui la gardent.
 */
const changeRequest = () => ({
  subjectLabel: subjectLabel(),
  orderId: ref("order"),
  orderNumber: z.string(),
  requestId: ref("customer_request"),
  /** La révision sur laquelle le client a composé. */
  baseRevision: count(),
});

export const ORDER_CHANGE_REQUEST_FACTS = {
  /** Le client a demandé une modification, l'heure limite passée. */
  "order.change_requested": fact(payload(changeRequest())),
  /** Le commerce l'a appliquée : `revision` est celle qu'elle a produite. */
  "order.change_applied": fact(payload({ ...changeRequest(), revision: count() })),
  /** Le commerce l'a refusée ; `reason` est le mot adressé au client. */
  "order.change_refused": fact(payload({ ...changeRequest(), reason: z.string() })),
} as const;
