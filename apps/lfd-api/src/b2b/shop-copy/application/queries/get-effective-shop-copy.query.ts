import type { ShopCopyLocale } from "../../domain/shop-copy-locale.js";

/**
 * Query : le texte EFFECTIF de chaque clé d'une langue — le remplacement
 * publié s'il existe, sinon le texte du code. Pour un lecteur qui n'a pas les
 * dictionnaires de la boutique sous la main : la vitrine de l'agence (plan
 * `documentation/webhooks/plan-webhook-vitrine.md`, S1).
 */
export class GetEffectiveShopCopyQuery {
  constructor(readonly locale: ShopCopyLocale) {}
}
