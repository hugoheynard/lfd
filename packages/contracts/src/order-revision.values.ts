/**
 * **Ce qu'une révision de commande peut changer** — le résumé que le journal
 * garde (`order.revised`, plan `documentation/commandes/modification/plan-modifier-une-commande.md`,
 * M1). Des VALEURS écrites au journal : elles ne se renomment que par
 * migration.
 *
 * Dans un fichier `.values` sans dépendance, pour que le catalogue du journal
 * les lise sans embarquer le contrat des commandes.
 */
export const ORDER_REVISION_CHANGES = [
  "lines",
  "date",
  "method",
  "pickup_point",
  "delivery_address",
  "window",
  "contact",
  "signature",
  "note",
] as const;
export type OrderRevisionChange = (typeof ORDER_REVISION_CHANGES)[number];

/**
 * **Pourquoi le client ne peut pas modifier sa commande maintenant** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, R1, §6) — des codes,
 * pas des phrases : la boutique les dit dans la langue du client.
 *
 * - `cancelled`, `ready`, `partially_handed_over`, `fulfilled` : l'état de
 *   la commande le dit déjà (`partially_handed_over` : une partie est
 *   retirée, plan E7 reliquat) ;
 * - `in_preparation` : inscrite au compte à produire, ou plan du jour arrêté ;
 * - `card_settled` : réglée par carte (lot M2, à concevoir) ;
 * - `too_late` : l'heure limite de sa date est passée (M4 : la demande) ;
 * - `accounting` : engagée en comptabilité (facturée, prélevée…) ;
 * - `payment_in_progress` : un remboursement attend son issue ;
 * - `unavailable` : tout le reste (bon déjà resservi, état illisible) — la
 *   boutique propose de nous contacter.
 */
export const ORDER_REVISION_REFUSALS = [
  "cancelled",
  "ready",
  "partially_handed_over",
  "fulfilled",
  "in_preparation",
  "card_settled",
  "too_late",
  "accounting",
  "payment_in_progress",
  "unavailable",
] as const;
export type OrderRevisionRefusal = (typeof ORDER_REVISION_REFUSALS)[number];

/**
 * **La commande se modifie-t-elle, pour ce client, maintenant ?** Calculée sans
 * verrou par la même règle que la modification : une indication, pas une
 * promesse — le `POST` relit tout sous verrou.
 *
 * `until` : l'heure limite (ISO) de la commande telle qu'elle est — passée
 * pour `too_late`, à venir quand elle se modifie ; `null` quand aucune limite
 * ne s'applique ou que le refus n'a rien à voir avec l'heure.
 */
export type OrderRevisability =
  | {
      readonly revisable: true;
      readonly until: string | null;
      /**
       * Plan `documentation/commandes/modification/plan-s2-la-hausse.md`
       * (R2 ter, R3) : la commande est payée par carte — seule une HAUSSE s'y
       * fait, et elle se paie par un complément (`POST
       * /orders/:id/revisions/card-increase`) ; une baisse ou un changement à
       * total égal ne sont pas encore possibles. Servi depuis S2.b ; absent du
       * type tant que les écrans (S2.d) ne le lisent pas — absent = `false`.
       */
      readonly cardIncreaseOnly?: boolean;
    }
  | {
      readonly revisable: false;
      readonly code: OrderRevisionRefusal;
      readonly until: string | null;
    };

/**
 * **La commande se modifie-t-elle par l'équipe ?** — la règle staff (R1 :
 * heure limite ignorée). `reason` est la phrase du serveur, à montrer telle
 * quelle sous le bouton grisé : elle nomme le cas et le geste de sortie.
 */
export type AdminOrderRevisability =
  | {
      readonly revisable: true;
      /**
       * Plan A2 (2026-10-25) : la commande est déjà inscrite au plan du
       * fournil — l'équipe n'en change que les quantités. La phrase du
       * serveur, à montrer telle quelle ; ABSENT = tout se modifie.
       */
      readonly quantitiesOnly?: string;
    }
  | { readonly revisable: false; readonly reason: string };

/**
 * **Pourquoi une révision d'une commande payée par carte ne se fait pas**
 * (plan `documentation/commandes/modification/plan-s2-la-hausse.md`, R2 bis,
 * R15) — une baisse, un total égal, un premier paiement pas encore encaissé,
 * ou une hausse composée par l'équipe (« demandez au client de modifier sa
 * commande, ou passez une seconde commande »).
 */
export const ORDER_REVISION_CARD_REFUSALS = [
  "decrease",
  "same_total",
  "unsettled",
  "increase_by_staff",
] as const;
export type OrderRevisionCardRefusal = (typeof ORDER_REVISION_CARD_REFUSALS)[number];

/**
 * **Comment la révision devisée se réglera** (plan S2, R3) :
 *
 * - `as_placed` — comme la commande (au compte, ou à total nul) : `POST
 *   /orders/:id/revisions` ;
 * - `card_complement` — commande payée par carte, et hausse : « 12,00 € à
 *   payer », par `POST /orders/:id/revisions/card-increase` ;
 * - `card_not_revisable` — commande carte, et ni l'un ni l'autre : « pas
 *   encore possible ».
 */
export type OrderRevisionQuoteSettlement =
  | { readonly kind: "as_placed" }
  | { readonly kind: "card_complement"; readonly complementCents: number }
  | { readonly kind: "card_not_revisable"; readonly reason: OrderRevisionCardRefusal };
