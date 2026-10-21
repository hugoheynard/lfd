import { z } from "zod";

import type { ResupplyTarget } from "./site-resupply.js";

/**
 * **La réception du réassort d'un point** — Comptoir › Réassort boutique
 * (lot J1 de `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`,
 * refait au lot R2 de `documentation/reassort-boutiques/plan-reapprovisionnement.md`,
 * 2026-10-21). Aucun montant : un réassort n'est jamais une vente.
 */

/** Une ligne du stock estimé du jour : la SOMME des reçus, tous reçus confondus. */
export interface ResupplyReceiptLineView {
  /** Le SKU produit, celui des lignes de commande. */
  readonly sku: string;
  /** Le nom publié, figé à la première réception du jour. */
  readonly label: string;
  /** Somme des quantités reçues dans la journée (réassorts réceptionnés + sans commande). */
  readonly receivedQuantity: number;
  /**
   * Reçu − ce que les commandes « jour même sur stock » en ont pris. Ce circuit
   * n'est pas bâti (lot J2) : il vaut le reçu. Les commandes passées la veille
   * ne s'y soustraient pas — le fournil les a fabriquées pour elles.
   */
  readonly estimatedStock: number;
}

/** `expected` : envoyé, pas encore réceptionné ; `received` : compte au stock. */
export type ResupplyReceptionStatus = "expected" | "received";

/** Une ligne d'un réassort à réceptionner. */
export interface ResupplyReceptionLineView {
  readonly sku: string;
  readonly label: string;
  /** L'attendu : la quantité DEMANDÉE (la quantité emballée la remplacera, R3). */
  readonly expectedQuantity: number;
  /** Le reçu ; `null` tant que le réassort n'est pas réceptionné. */
  readonly receivedQuantity: number | null;
}

/** Un réassort envoyé pour la journée, et sa réception. */
export interface ResupplyReceptionView {
  readonly resupplyId: string;
  readonly target: ResupplyTarget;
  readonly placedAt: string;
  /** Nom figé de qui l'a envoyé ; `null` s'il est inconnu. */
  readonly placedBy: string | null;
  readonly status: ResupplyReceptionStatus;
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
  /** Le stock estimé du jour : somme des reçus. */
  readonly stock: readonly ResupplyReceiptLineView[];
}

/** Un article proposable à la réception : le catalogue publié de la boutique. */
export interface ResupplyArticleView {
  readonly sku: string;
  readonly name: string;
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
export const receiveResupplyLineSchema = z
  .object({ sku: z.string().trim().min(1), quantity: z.number() })
  .strict();
export type ReceiveResupplyLinePayload = z.infer<typeof receiveResupplyLineSchema>;

/**
 * `PATCH /admin/resupply-receipts/:siteId/:day/lines/:sku` (sans commande) et
 * `PATCH /admin/resupply-receipts/:siteId/resupplies/:resupplyId/lines/:sku`
 * (un écart après « Réceptionner ») — la quantité reçue corrigée.
 */
export const correctResupplyLineSchema = z.object({ quantity: z.number() }).strict();
export type CorrectResupplyLinePayload = z.infer<typeof correctResupplyLineSchema>;
