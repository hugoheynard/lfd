import { z } from "zod";

/**
 * **La réception du réapprovisionnement d'un site** — Comptoir › Réassort
 * boutique (plan `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`,
 * lot J1, 2026-10-21). Ce que la vitrine a reçu pour une journée, et le stock
 * estimé qui en découle. Aucun montant : un réapprovisionnement n'est jamais
 * une vente.
 */
export interface ResupplyReceiptLineView {
  /** Le SKU produit, celui des lignes de commande. */
  readonly sku: string;
  /** Le nom publié, figé à la saisie. */
  readonly label: string;
  readonly receivedQuantity: number;
  /**
   * Reçu − ce que les commandes « jour même sur stock » en ont pris. Ce circuit
   * n'est pas bâti (lot J2) : il vaut le reçu. Les commandes passées la veille
   * ne s'y soustraient pas — le fournil les a fabriquées pour elles.
   */
  readonly estimatedStock: number;
}

export interface ResupplyReceiptView {
  readonly siteId: string;
  /** `AAAA-MM-JJ`. */
  readonly serviceDay: string;
  /** Dans l'ordre de saisie ; vide tant que personne n'a rien saisi. */
  readonly lines: readonly ResupplyReceiptLineView[];
  /** Instant du dernier geste ; `null` tant que la liste n'a jamais été touchée. */
  readonly updatedAt: string | null;
  /** Nom figé de son auteur ; `null` s'il est inconnu ou si rien n'a été saisi. */
  readonly updatedBy: string | null;
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
 * `POST /admin/resupply-receipts/:siteId/:day/lines` — un article reçu. Le
 * libellé n'est PAS accepté : le serveur le lit au catalogue publié. La
 * règle sur la quantité (entier ≥ 0) vit dans le domaine.
 */
export const receiveResupplyLineSchema = z
  .object({ sku: z.string().trim().min(1), quantity: z.number() })
  .strict();
export type ReceiveResupplyLinePayload = z.infer<typeof receiveResupplyLineSchema>;

/** `PATCH /admin/resupply-receipts/:siteId/:day/lines/:sku` — la quantité corrigée. */
export const correctResupplyLineSchema = z.object({ quantity: z.number() }).strict();
export type CorrectResupplyLinePayload = z.infer<typeof correctResupplyLineSchema>;
