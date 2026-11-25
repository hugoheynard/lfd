import { z } from "zod";

import { SHORTFALL_REFUND_CAUSES, shortfallRemainderSchema } from "../admin-order-detail.js";
import { cents, count, fact, instant, namedOrBare, payload, ref, subjectLabel } from "./fact.js";

/**
 * **Le départ incomplet décidé** (plan
 * plan E6c2 (`documentation/commandes/bon-de-livraison.md`)
 * § 5) — une décision d'argent prise par une personne : la facture lira ce qui
 * part, plus la commande entière. Le sujet est le client, comme
 * `order.revised` ; `decidedBy` la fiche staff, sous son nom du moment ;
 * `departing` ce qui part, article par article ; `remainder` le sort du reste
 * (`abandoned` seul jusqu'au reliquat, E7).
 */
export const ORDER_SHORTFALL_FACTS = {
  /**
   * **Un manque signalé au colisage** (plan du reliquat, § 5 ter, B4b.3) —
   * l'historique de la commande garde CHAQUE signal : le suivant ne l'écrase
   * pas. Le sujet est la COMMANDE, son libellé son numéro ; écrit par l'abonné
   * du commerce au fait `packing.shortfall_reported` (acteur `system`) :
   * `reportedBy` dit la fiche staff qui a signalé, `reportedAt` l'instant du
   * geste, `rank` l'envoi, `lines` dû et au bac par article. 🔴 Type irréversible.
   */
  "order.shortfall_reported": fact(
    payload({
      subjectLabel: subjectLabel(),
      reportedBy: namedOrBare("staff_user"),
      reportedAt: instant(),
      rank: z.number().int().min(1),
      lines: z.array(z.object({ sku: z.string().min(1), due: count(), packed: count() })),
    }),
  ),
  /**
   * **Le client prévenu d'un départ incomplet** (plan du reliquat, § 5 ter,
   * B4b.3) — « Écrire au client », une fois par décision. Le sujet est la
   * COMMANDE ; qui et quand viennent du contexte. Le texte n'est pas recopié :
   * il est au suivi des e-mails. 🔴 Type irréversible.
   */
  "order.shortfall_letter_sent": fact(payload({ subjectLabel: subjectLabel() })),
  "order.shortfall_decided": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      orderId: ref("order"),
      orderNumber: z.string(),
      decidedBy: namedOrBare("staff_user"),
      departing: z.array(z.object({ sku: z.string().min(1), quantity: count() })),
      remainder: shortfallRemainderSchema,
    }),
  ),
  /**
   * **Le reste d'un départ incomplet n'a pas été remboursé** (plan
   * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.4) : au
   * solde, l'abonné a jugé qu'aucune demande ne pouvait partir, et n'a rien
   * écrit côté argent. Écrit par la machine (acteur `system`). Le sujet est la
   * COMMANDE, son libellé son numéro. `amountCents` : le reste calculé, `null`
   * quand la cause est jugée avant le calcul (facture émise, hausse en
   * cours) ; `stoppedAmount` : parmi les paiements qui se rendent, une demande
   * arrêtée attend « Relancer » ou « Réglé autrement » — la sortie d'un
   * `not_covered`. 🔴 Type et causes irréversibles.
   */
  "order.shortfall_refund_blocked": fact(
    payload({
      subjectLabel: subjectLabel(),
      cause: z.enum(SHORTFALL_REFUND_CAUSES),
      amountCents: cents().nullable(),
      stoppedAmount: z.boolean(),
    }),
  ),
  /**
   * **Le reliquat de commande** (plan
   * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 2) :
   * ce qui n'est pas parti, gardé pour une commande à venir. Le sujet est la
   * COMMANDE D'ORIGINE (un reliquat par origine), son libellé son numéro ;
   * l'auteur et l'instant viennent du contexte. `opened` : naît avec la
   * décision du départ, `lines` le reste par article — des pièces, ou des
   * grammes au poids. `converted` : la commande qui en est issue
   * (`orderId`, `orderNumber`). `abandoned` : le client n'en veut pas.
   * 🔴 Types irréversibles.
   */
  "backorder.opened": fact(
    payload({
      subjectLabel: subjectLabel(),
      lines: z.array(
        z.object({
          sku: z.string().min(1),
          quantity: count(),
          saleUnit: z.enum(["piece", "weight"]),
        }),
      ),
    }),
  ),
  "backorder.converted": fact(
    payload({
      subjectLabel: subjectLabel(),
      orderId: ref("order"),
      orderNumber: z.string(),
    }),
  ),
  "backorder.abandoned": fact(payload({ subjectLabel: subjectLabel() })),
};
