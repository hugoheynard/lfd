import { z } from "zod";

import type { OrderSaleUnit } from "./order.js";

/**
 * **Le reste d'aujourd'hui d'un article, à un point** (plan
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`, lot L7b) —
 * ce que la boutique écrit sur la vignette (« plus que 3 », « plus que
 * 1,2 kg ») et ce qui grise un article pour aujourd'hui.
 *
 * Une annonce, jamais une autorisation : la passation relit le reste sous le
 * verrou du stock et reste seule à refuser.
 *
 * Rien de la commande des autres n'y transite, ni identifiant de reçu : un
 * reste par article, et seulement des articles servis à l'appelant.
 */
export interface ShelfStockTodayLineView {
  /** Le SKU de vente, tel que le catalogue de l'appelant le sert. */
  readonly sku: string;
  readonly saleUnit: OrderSaleUnit;
  /** Ce qui reste, toujours positif : des pièces, ou des GRAMMES au poids. */
  readonly left: number;
}

/**
 * La réponse : vide quand aujourd'hui n'est pas vendu sur la vitrine à cet
 * appelant (plan du jour non arrêté, circuit fermé à sa clientèle, plus de
 * créneau au point). Un article absent n'a plus rien en vitrine.
 */
export type ShelfStockTodayView = readonly ShelfStockTodayLineView[];

/** Borne d'un identifiant de point dans une URL — un ULID en fait 26. */
const PICKUP_ADDRESS_ID_MAX = 64;

/**
 * `?pickupAddressId=…` — le point dont on lit la vitrine. L'audience n'en fait
 * pas partie : la route anonyme la reçoit comme `/fulfillment-days`, la route
 * reconnue la décide au serveur.
 */
export const shelfStockTodayPickupSchema = z.string().trim().min(1).max(PICKUP_ADDRESS_ID_MAX);
