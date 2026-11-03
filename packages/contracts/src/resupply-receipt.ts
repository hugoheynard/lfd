import { z } from "zod";

import type { OrderSaleUnit } from "./order.js";
import type { ResupplyOrigin, ResupplyTarget } from "./site-resupply.js";

/**
 * **La réception du réassort d'un point** — Comptoir › Réassort boutique
 * (lot J1 de `documentation/limites-de-commande/jour-meme-sur-stock.md`,
 * refait au lot R2 de `documentation/reassort-boutiques/README.md`,
 * 2026-10-21). Aucun montant : un réassort n'est jamais une vente.
 */

/** Une ligne du stock estimé du jour : la SOMME des reçus, tous reçus confondus. */
export interface ResupplyReceiptLineView {
  /** Le SKU produit, celui des lignes de commande. */
  readonly sku: string;
  /** Le nom publié, figé à la première réception du jour. */
  readonly label: string;
  /**
   * L'unité des deux quantités (lot L2b-1) : des grammes si `weight`. Un
   * même article peut avoir une ligne par unité, jamais une somme des deux.
   */
  readonly saleUnit: OrderSaleUnit;
  /** Somme des quantités reçues dans la journée (réassorts réceptionnés + sans commande). */
  readonly receivedQuantity: number;
  /**
   * **Le reste en vitrine** : reçu − ce que les commandes sur stock
   * (`supply = shelf`, ni brouillon ni annulées) en ont pris — `DayShelfStock`,
   * le calcul que la passation garde sous verrou (plan du jour J, L2, L4).
   * C'est aussi ce que le comptoir lit pour réduire son catalogue au
   * « Retrait immédiat » (L6). Les commandes fabriquées pour ce jour ne s'y
   * soustraient pas — le fournil les a cuites pour elles.
   */
  readonly estimatedStock: number;
}

/** `expected` : envoyé, pas encore réceptionné ; `received` : compte au stock. */
export type ResupplyReceptionStatus = "expected" | "received";

/** Une ligne d'un réassort à réceptionner. */
export interface ResupplyReceptionLineView {
  readonly sku: string;
  readonly label: string;
  /**
   * L'attendu : la quantité EMBALLÉE au colisage quand sa fiche est close
   * (R3b), sinon la quantité DEMANDÉE.
   */
  readonly expectedQuantity: number;
  /** Le reçu ; `null` tant que le réassort n'est pas réceptionné. */
  readonly receivedQuantity: number | null;
  /** L'unité des deux quantités, figée à l'ajout (lot L2b-1) : des grammes si `weight`. */
  readonly saleUnit: OrderSaleUnit;
}

/** Un réassort envoyé pour la journée, et sa réception. */
export interface ResupplyReceptionView {
  readonly resupplyId: string;
  readonly target: ResupplyTarget;
  /** `bakehouse` : « envoyé par le fournil » (R1d) ; il se réceptionne comme les autres. */
  readonly origin: ResupplyOrigin;
  /** Son nom libre (R1g), « Vitrine du matin » ; `null` : sans nom. */
  readonly name: string | null;
  readonly placedAt: string;
  /** Nom figé de qui l'a envoyé ; `null` s'il est inconnu. */
  readonly placedBy: string | null;
  readonly status: ResupplyReceptionStatus;
  /**
   * « Il est là » (lot R3e) : la réception du transfert, ou « Monté » au
   * fournil. Un réassort `expected` avec `arrivedAt` se dit « arrivé » ;
   * sans, « attendu ». Réceptionner n'attend jamais ce signal.
   */
  readonly arrivedAt: string | null;
  readonly arrivedBy: string | null;
  /** « Lancé » au fournil (R4a, « au plus tôt » seulement) ; `null` sinon. */
  readonly launchedAt: string | null;
  readonly launchedBy: string | null;
  /** « Parti » (R4d) : la tournée qui porte son transfert est partie ; `null` sinon. */
  readonly departedAt: string | null;
  readonly departedBy: string | null;
  /** Instant de « Réceptionner » ; `null` tant qu'il est attendu. */
  readonly receivedAt: string | null;
  readonly receivedBy: string | null;
  readonly lines: readonly ResupplyReceptionLineView[];
}

/** Une ligne d'un réassort sans commande. */
export interface UnorderedReceiptLineView {
  readonly sku: string;
  readonly label: string;
  readonly receivedQuantity: number;
  /** L'unité figée à la saisie (lot L2b-1) : des grammes si `weight`. */
  readonly saleUnit: OrderSaleUnit;
}

/** Le réassort sans commande du jour : la saisie de secours, ligne par ligne. */
export interface UnorderedReceiptView {
  /** Dans l'ordre de saisie ; vide tant que personne n'a rien saisi. */
  readonly lines: readonly UnorderedReceiptLineView[];
  /** Instant du dernier geste ; `null` tant que rien n'a été saisi. */
  readonly updatedAt: string | null;
  /** Nom figé de son auteur ; `null` s'il est inconnu ou si rien n'a été saisi. */
  readonly updatedBy: string | null;
}

export interface ResupplyReceiptView {
  readonly siteId: string;
  /** `AAAA-MM-JJ`. */
  readonly serviceDay: string;
  /**
   * Les réassorts envoyés pour cette journée (non annulés, ou déjà
   * réceptionnés), dans l'ordre d'envoi.
   */
  readonly receptions: readonly ResupplyReceptionView[];
  readonly unordered: UnorderedReceiptView;
  /** Le reste du jour, par article et unité : reçus − prélèvements sur stock. */
  readonly stock: readonly ResupplyReceiptLineView[];
}

/** Un article proposable à la réception : le catalogue publié de la boutique. */
export interface ResupplyArticleView {
  readonly sku: string;
  readonly name: string;
  /**
   * Sa famille au catalogue (la tête de sa lignée) : ce par quoi le comptoir
   * filtre la table. Une donnée du référentiel, jamais une liste en dur.
   */
  readonly categoryId: string;
  readonly categoryName: string;
  /** Son unité de vente : au poids, une quantité de réassort compte des grammes (lot L2b-1). */
  readonly saleUnit: OrderSaleUnit;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Le jour d'une réception, dans l'URL. */
export const resupplyServiceDaySchema = z
  .string()
  .regex(DAY_PATTERN, "jour attendu au format AAAA-MM-JJ");

/**
 * `POST /admin/resupply-receipts/:siteId/:day/lines` — un article reçu en
 * réassort sans commande. Le
 * libellé n'est PAS accepté : le serveur le lit au catalogue publié. La
 * règle sur la quantité (entier ≥ 0) vit dans le domaine.
 */
export const receiveUnorderedReceiptLineSchema = z
  .object({ sku: z.string().trim().min(1), quantity: z.number() })
  .strict();
export type ReceiveUnorderedReceiptLinePayload = z.infer<typeof receiveUnorderedReceiptLineSchema>;

/**
 * `PATCH /admin/resupply-receipts/:siteId/:day/lines/:sku` (sans commande) et
 * `PATCH /admin/resupply-receipts/:siteId/resupplies/:resupplyId/lines/:sku`
 * (un écart après « Réceptionner ») — la quantité reçue corrigée.
 */
export const correctReceiptLineSchema = z.object({ quantity: z.number() }).strict();
export type CorrectReceiptLinePayload = z.infer<typeof correctReceiptLineSchema>;
