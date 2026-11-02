import { DomainError } from "../../../../platform/shared/errors/app-error.js";

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
