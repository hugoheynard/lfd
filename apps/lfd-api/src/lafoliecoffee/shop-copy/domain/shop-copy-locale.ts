/**
 * Les langues de la boutique. Déclarées ici plutôt qu'importées du contrat :
 * le domaine ne dépend de rien, et la base les tient aussi (CHECK).
 */
export const SHOP_COPY_LOCALES = ["fr", "en", "it"] as const;
export type ShopCopyLocale = (typeof SHOP_COPY_LOCALES)[number];

/** La langue de référence (A2) : celle dont un changement rend les autres suspectes. */
export const REFERENCE_LOCALE: ShopCopyLocale = "fr";
