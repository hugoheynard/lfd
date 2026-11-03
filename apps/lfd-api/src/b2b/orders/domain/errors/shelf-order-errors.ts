import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus d'une **commande prise sur la vitrine** (`supply = shelf`, plan
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`).
 * Une telle commande puise dans le stock du jour d'UN point : elle est un
 * retrait, d'aujourd'hui, à ce point — sans quoi elle ne serait ni cuite (hors
 * plan) ni présente en vitrine.
 */

/** Une commande sur stock est un retrait : la livraison du jour est hors périmètre (§8). */
export class ShelfOrderNotPickupError extends DomainError {
  constructor() {
    super(
      "orders.shelf.not_pickup",
      "Une commande prise sur le stock de la vitrine se retire au comptoir : elle ne peut pas être livrée. Choisissez le retrait, ou passez une commande programmée pour la livraison.",
    );
  }
}

/** Une commande sur stock vise le stock du jour : elle a une journée, et c'est aujourd'hui. */
export class ShelfOrderNotTodayError extends DomainError {
  constructor(
    readonly serviceDay: string | null,
    readonly today: string,
  ) {
    super(
      "orders.shelf.not_today",
      serviceDay === null
        ? "Une commande prise sur le stock de la vitrine se retire aujourd'hui : elle doit porter la journée d'aujourd'hui."
        : `Une commande prise sur le stock de la vitrine se retire le jour même (${today}), pas le ${serviceDay} : le stock d'un autre jour n'existe pas encore. Passez une commande programmée pour cette date.`,
    );
  }
}

/** Ce qu'une révision d'une commande sur stock ne peut pas changer (§12, 2 ; §13). */
export type ShelfFrozenRoute = "method" | "date" | "pickup_point";

const FROZEN_ROUTE_LABEL: Readonly<Record<ShelfFrozenRoute, string>> = {
  method: "son mode de retrait",
  date: "sa journée",
  pickup_point: "son point de retrait",
};

/**
 * Une commande sur stock garde son acheminement : le stock d'un autre point,
 * ou d'un autre jour, est un autre stock — et une livraison entrerait dans les
 * tournées.
 */
export class ShelfOrderRouteChangeError extends DomainError {
  constructor(
    readonly orderId: string,
    readonly change: ShelfFrozenRoute,
  ) {
    super(
      "orders.revise.shelf_route",
      `Cette commande a été prise sur le stock de la vitrine : on peut en changer les articles et les quantités, pas ${FROZEN_ROUTE_LABEL[change]}. Annulez-la, puis passez-en une nouvelle.`,
    );
  }
}

/**
 * Le « Retrait immédiat » (`entry_shortcut = immediate_pickup`, lot L6) n'existe
 * que sur une commande prise sur la vitrine : c'est un retrait, aujourd'hui, à
 * ce point. Envoyé sur une commande programmée, il compterait un raccourci qui
 * n'a pas servi.
 */
export class EntryShortcutOffShelfError extends DomainError {
  constructor() {
    super(
      "orders.shelf.shortcut_off_shelf",
      "Le « Retrait immédiat » se prend sur le stock de la vitrine : il ne s'applique pas à une commande programmée. Choisissez « Retrait immédiat » sur un retrait d'aujourd'hui, ou passez une commande programmée sans ce raccourci.",
    );
  }
}

/**
 * **Au comptoir, la saisie de l'équipe se règle au compte** (Hugo,
 * 2026-11-03, E4 — `documentation/pricing/saisie/plan-prix-de-la-saisie.md`
 * §5) : rien ne s'encaisse au comptoir par notre système, et un lien de
 * règlement envoyé à un client qui est devant le vendeur n'a pas de sens.
 * Un pro sans compte ne commande pas au comptoir par la saisie.
 */
export class CounterLinkSettlementRefusedError extends DomainError {
  constructor() {
    super(
      "orders.counter.link_settlement_refused",
      "Au comptoir, une commande saisie se règle au compte : le lien de règlement n'y est pas proposé. Choisissez « Au compte » si ce client a un crédit ; sinon, il commande depuis son espace, ou par le commercial qui peut lui envoyer un lien.",
    );
  }
}

/**
 * Pourquoi le règlement au compte n'est pas admis — les trois cas que lit
 * `accountStanding` (vérifié le 2026-11-03 dans `order-settlement.ts` et
 * `prisma-order-guard.reader.ts`) : la société qui commande n'est pas active,
 * son payeur n'a aucun délai de paiement accordé, ou le prélèvement du payeur
 * est suspendu par la comptabilité. La société SUSPENDUE se nomme à part
 * (É18, Hugo, 2026-11-03) : comme dans son espace, elle ne commande qu'au
 * prix public, réglée immédiatement — et le comptoir n'a pas de lien (E4).
 */
export type CounterAccountRefusalCause =
  "company_suspended" | "company_inactive" | "terms_not_granted" | "direct_debit_blocked";

const COUNTER_ACCOUNT_REFUSALS: Readonly<Record<CounterAccountRefusalCause, string>> = {
  company_suspended:
    "Le compte de ce client est suspendu : il ne peut commander qu'au prix public, réglé immédiatement, et ce règlement ne se fait pas au comptoir. Il peut commander depuis son espace, ou son compte se réactive sur sa fiche client.",
  company_inactive:
    "Le compte de ce client n'est pas actif : il ne peut pas commander au comptoir tant que son compte n'est pas activé sur sa fiche client.",
  terms_not_granted:
    "Le paiement différé n'est pas ouvert pour ce client : il ne peut pas commander au comptoir. Il peut commander depuis son espace, ou le paiement différé s'ouvre sur sa fiche client (Informations, Moyens de paiement).",
  direct_debit_blocked:
    "Le prélèvement de ce client est suspendu par la comptabilité : il ne peut pas commander au comptoir. Il peut commander depuis son espace, ou la comptabilité lève la suspension.",
};

/**
 * **Au comptoir, le règlement au compte refusé ne laisse aucun règlement**
 * (Hugo, 2026-11-03, plan `documentation/pricing/saisie/plan-prix-de-la-saisie.md`
 * §5) : le lien y est refusé ({@link CounterLinkSettlementRefusedError}). Le
 * refus est distinct de `AccountSettlementNotGrantedError`, dont le geste de
 * sortie — « réglez par lien » — n'existe pas au comptoir ; il dit la cause
 * réelle, une phrase par cause.
 */
export class CounterAccountSettlementNotGrantedError extends BusinessError {
  constructor(readonly reason: CounterAccountRefusalCause) {
    super(`orders.counter.${reason}`, COUNTER_ACCOUNT_REFUSALS[reason]);
  }
}
