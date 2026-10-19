import type { ShopItemView } from "./shop-catalogue.js";

/**
 * L'audience d'une sélection « Incontournables » lue sans jeton. `pro` seul
 * pour l'instant (2026-10-19) : la landing `/pro` est son unique lecteur.
 */
export type ShopFeaturedAudience = "pro";

/**
 * **Un incontournable**, tel qu'un visiteur anonyme le voit sur `/pro`.
 *
 * 🔴 **Aucun prix, et c'est voulu** (Hugo, 2026-10-19) : un prix pro dépend de
 * la société — mercuriale, remises, tarif de canal. À un visiteur sans compte,
 * n'importe quel chiffre serait faux pour quelqu'un ; on n'en montre aucun.
 * La forme est découpée dans `ShopItemView` pour que nom, ligne et images
 * restent ceux de la vitrine.
 */
export type ShopFeaturedItemView = Pick<
  ShopItemView,
  "sku" | "name" | "note" | "image" | "thumbnail" | "shelfId"
>;

/** `GET /shop/featured?audience=pro&lang=` — dans l'ordre d'affichage du catalogue. */
export type ShopFeaturedView = readonly ShopFeaturedItemView[];
