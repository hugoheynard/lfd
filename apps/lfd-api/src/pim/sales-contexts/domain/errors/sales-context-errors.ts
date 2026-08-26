import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/** La clé d'un contexte est obligatoire et suit une forme stable. */
export class SalesContextKeyInvalidError extends DomainError {
  constructor(raw: string) {
    super(
      "catalogue.sales_context.key_invalid",
      `Clé de contexte invalide : « ${raw} ». Lettres, chiffres et tirets, ` +
        `en commençant par une lettre — c'est une identité que la base cite.`,
    );
  }
}

/** Le libellé est ce qu'un humain lit : il ne peut pas être vide. */
export class SalesContextLabelRequiredError extends DomainError {
  constructor() {
    super("catalogue.sales_context.label_required", "Le libellé est obligatoire.");
  }
}

/** Deux contextes ne portent pas la même clé — elle est citée par trois tables. */
export class SalesContextKeyTakenError extends BusinessError {
  constructor(key: string) {
    super(
      "catalogue.sales_context.key_taken",
      `Un contexte de vente porte déjà la clé « ${key} ».`,
    );
  }
}

/** Le contexte visé n'existe pas (→ 404). */
export class SalesContextNotFoundError extends BusinessError {
  constructor(key: string) {
    super("catalogue.sales_context.not_found", `Contexte de vente introuvable : ${key}.`);
  }
}

/**
 * On ne touche pas au contexte **racine** — ni sa clé, ni sa portée, ni son
 * existence.
 *
 * Même protection que l'admin racine, et pour la même raison : sans lui, la
 * plateforme professionnelle cesse de facturer **sans qu'une erreur soit
 * levée**. Il reste désactivable — fermer un canal n'est pas effacer sa
 * définition.
 */
export class RootSalesContextProtectedError extends BusinessError {
  constructor(what: string) {
    super(
      "catalogue.sales_context.root_protected",
      `Le contexte racine ne peut pas ${what}. Il peut en revanche être mis hors service.`,
    );
  }
}

/**
 * Deux contextes **projetés vers Shopify** ne peuvent pas partager un suffixe
 * de handle : ils produiraient la même URL de produit.
 *
 * Le vide est celui du contexte par défaut — le handle nu, qui protège les URL
 * déjà indexées. Un second contexte projeté doit donc en porter un.
 */
export class SalesContextHandleTakenError extends BusinessError {
  constructor(suffix: string) {
    super(
      "catalogue.sales_context.handle_taken",
      suffix === ""
        ? `Un autre contexte est déjà projeté sans suffixe : son handle est le handle nu.`
        : `Un autre contexte projeté porte déjà le suffixe « ${suffix} ».`,
    );
  }
}

/** Le contexte est encore vendu, ou encore offert par un lieu : on refuse de l'effacer. */
export class SalesContextInUseError extends BusinessError {
  constructor(key: string) {
    super(
      "catalogue.sales_context.in_use",
      `« ${key} » est encore vendu ou réglé quelque part. Retirez-le des grilles ` +
        `de canaux et des taux avant de le supprimer — ou mettez-le hors service.`,
    );
  }
}
