import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Le payeur du site n'est pas actif** (`plan-sous-comptes.md` §2.4, Q4).
 *
 * Un site qui suit `billing` est réglé par son principal : la passation lit le
 * statut du PAYEUR, pas seulement celui du site. Un 409 — l'état du monde
 * s'oppose au geste — qui nomme le principal, parce que la personne au
 * comptoir ne voit que le chalet et ne saurait pas où chercher.
 */
export class OrderPayerNotActiveError extends BusinessError {
  constructor(
    readonly companyId: string,
    readonly payerName: string,
  ) {
    super(
      "order.payer_not_active",
      `Ce site est facturé à « ${payerName} », dont le compte n'est pas actif : aucune commande ne peut être passée pour lui. Contactez-nous pour rétablir le compte de « ${payerName} ».`,
    );
  }
}

/**
 * **Un compte de groupe ne commande pas en son nom propre** (§2.4, §4).
 *
 * La case « compte de groupe, sans livraison » dit qu'une holding négocie et
 * ne reçoit rien : une commande à son nom n'aurait ni adresse ni réceptionnaire.
 * La sortie est de commander depuis l'un de ses sous-comptes.
 */
export class GroupAccountOrderRefusedError extends BusinessError {
  constructor(
    readonly companyId: string,
    readonly companyName: string,
  ) {
    super(
      "order.group_account_without_delivery",
      `« ${companyName} » est un compte de groupe, sans livraison : il ne commande pas en son nom. Passez la commande depuis l'un de ses sous-comptes.`,
    );
  }
}

/**
 * Un payeur copié sur une commande sans société — l'image du CHECK
 * `order_billed_needs_company`. Inatteignable par la passation, qui ne résout
 * de payeur que pour une société ; écrite pour que l'agrégat le refuse
 * avant la base.
 */
export class BilledWithoutCompanyError extends DomainError {
  constructor() {
    super(
      "order.billed_without_company",
      "Une commande sans société n'a pas de payeur à copier : le payeur se résout depuis la société qui commande.",
    );
  }
}
