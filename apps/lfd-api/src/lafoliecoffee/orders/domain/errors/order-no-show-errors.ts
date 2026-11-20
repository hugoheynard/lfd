import { instantToLocal } from "@lfd/contracts";

import { BusinessError, TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** « 14:30 le 21/11 » à Paris : l'instant que lit l'équipe du comptoir. */
function parisMomentOf(at: Date): string {
  const { day, time } = instantToLocal(at);
  const [, month = "", dayOfMonth = ""] = day.split("-");
  return `${time} le ${dayOfMonth}/${month}`;
}

/**
 * **« Le client n'est pas venu » refusé** — la commande n'est pas dans un état
 * où l'absence se déclare (pas à régler en boutique, annulée, déjà retirée…).
 * `BusinessError` (409) : la demande est bien formée, c'est l'état qui s'y
 * oppose ; la phrase nomme le cas.
 */
export class NoShowRefusedError extends BusinessError {
  constructor(reason: string) {
    super("orders.no_show.refused", reason);
  }
}

/** **Déjà déclarée non retirée** — l'état est terminal, il ne se redéclare pas. */
export class NoShowAlreadyDeclaredError extends BusinessError {
  constructor(readonly reference: string) {
    super(
      "orders.no_show.already_declared",
      `La commande ${reference} est déjà déclarée non retirée : il n'y a rien à refaire. Pour prévenir le client, demandez-le à la supervision du comptoir.`,
    );
  }
}

/** **Trop tôt** : le créneau de retrait n'est pas fini, le client peut encore venir. */
export class NoShowTooEarlyError extends BusinessError {
  constructor(
    readonly reference: string,
    readonly slotEnd: Date,
  ) {
    super(
      "orders.no_show.too_early",
      `Le créneau de retrait de la commande ${reference} court jusqu'à ${parisMomentOf(slotEnd)} : le client peut encore venir. Déclarez-la non retirée après cette heure.`,
    );
  }
}

/** **« Prévenir le client » refusé** : la commande n'est pas déclarée non retirée. */
export class NoShowNoticeRefusedError extends BusinessError {
  constructor(reason: string) {
    super("orders.no_show_notice.refused", reason);
  }
}

/** **Le client a déjà été prévenu** — l'e-mail « non retirée » ne part qu'une fois. */
export class NoShowNoticeAlreadyRequestedError extends BusinessError {
  constructor(readonly reference: string) {
    super(
      "orders.no_show_notice.already_requested",
      `L'e-mail « commande non retirée » a déjà été demandé pour la commande ${reference} : il ne part qu'une fois. Pour aller plus loin, appelez le client.`,
    );
  }
}

/** Un fait `order.no_show` reçu hors de son contrat : le journal ne l'a pas inscrit. */
export class OrderNoShowPayloadError extends TechnicalError {
  constructor() {
    super(
      "order_no_show.payload_invalid",
      "Le fait « commande non retirée » reçu est illisible : le journal ne l'a pas inscrit. Le " +
        "message reste dans la boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
