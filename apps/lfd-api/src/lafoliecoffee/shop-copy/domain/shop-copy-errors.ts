import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/** La clé n'est pas dans le manifeste que cette API a compilé. */
export class UnknownShopCopyKeyError extends ResourceNotFoundError {
  constructor(key: string) {
    super(
      "SHOP_COPY_KEY_UNKNOWN",
      `Le texte « ${key} » n'existe pas dans la boutique servie par cette version : il a été retiré ou renommé. Recharger l'écran des textes pour voir la liste à jour.`,
    );
  }
}

/** Le remplacement proposé ne respecte pas un garde-fou (§2 du plan). */
export class InvalidShopCopyTextError extends DomainError {
  constructor(key: string, reason: string) {
    super("SHOP_COPY_TEXT_INVALID", `Le texte « ${key} » ne peut pas être enregistré : ${reason}`);
  }
}

/** Quelqu'un a écrit ce texte depuis que l'écran l'a lu. */
export class ShopCopyChangedError extends BusinessError {
  constructor(key: string, locale: string) {
    super(
      "SHOP_COPY_CHANGED",
      `Le texte « ${key} » (${locale}) a été modifié par quelqu'un d'autre pendant que vous l'aviez ouvert. Rechargez l'écran pour voir sa version, puis refaites votre modification.`,
    );
  }
}

/** « Publier » sans rien à publier : pas de version vide au journal. */
export class NothingToPublishError extends BusinessError {
  constructor() {
    super(
      "SHOP_COPY_NOTHING_TO_PUBLISH",
      "Aucun texte n'attend d'être publié : modifiez ou remettez à l'original au moins un texte avant de publier.",
    );
  }
}

/** Deux « Publier » au même instant : le second n'écrit rien. */
export class ShopCopyPublishedMeanwhileError extends BusinessError {
  constructor() {
    super(
      "SHOP_COPY_PUBLISHED_MEANWHILE",
      "Quelqu'un vient de publier les textes de la boutique en même temps que vous. Rechargez l'écran : ce qui reste à publier y est indiqué.",
    );
  }
}
