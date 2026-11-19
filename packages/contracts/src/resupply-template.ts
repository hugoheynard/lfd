import { z } from "zod";

import { type OrderSaleUnit, orderSaleUnitSchema } from "./order.js";
import { RESUPPLY_TARGETS, type ResupplyTarget } from "./site-resupply.js";

/**
 * **Les modèles de réassort d'un point** (« Base matin », « Réassort
 * après-midi ») — plan `documentation/reassort-boutiques/plan-modeles-de-reassort.md`.
 *
 * Un raccourci de saisie : une liste d'articles et de quantités, qu'on
 * applique à la demande en cours puis qu'on ajuste. Il ne part jamais seul,
 * et aucun réassort ne garde trace du modèle dont il est parti.
 */

/**
 * Une ligne : un article, sa quantité et son unité, sans libellé. `quantity`
 * n'est que la FORME : l'entier ≥ 1 est la règle du domaine, comme pour toute
 * quantité du réassort. L'unité est exigée — aucun modèle n'est né avant elle.
 */
export const resupplyTemplateLineSchema = z
  .object({
    sku: z.string().trim().min(1),
    quantity: z.number(),
    saleUnit: orderSaleUnitSchema,
  })
  .strict();
export type ResupplyTemplateLine = z.infer<typeof resupplyTemplateLineSchema>;

/**
 * Le contenu ENTIER d'un modèle, qui remplace le précédent à chaque
 * ajustement. Le nom est exigé et unique parmi les modèles actifs du point —
 * règle du serveur (409), comme sa longueur.
 */
export const resupplyTemplateContentSchema = z
  .object({
    name: z.string(),
    target: z.enum(RESUPPLY_TARGETS),
    lines: z.array(resupplyTemplateLineSchema).min(1).max(200),
  })
  .strict();
export type ResupplyTemplateContentPayload = z.infer<typeof resupplyTemplateContentSchema>;

/**
 * `POST /admin/resupply-templates/sites/:siteId` — créer. `key` est tirée par
 * l'écran, une par geste : elle devient l'identifiant du modèle, et un second
 * envoi sous la même clé rend le modèle déjà écrit ; prise par le modèle d'un
 * autre point, elle est refusée (409).
 */
export const createResupplyTemplateSchema = resupplyTemplateContentSchema
  .extend({ key: z.string().trim().min(1).max(64) })
  .strict();
export type CreateResupplyTemplatePayload = z.infer<typeof createResupplyTemplateSchema>;

/**
 * `PUT /admin/resupply-templates/:templateId` — ajuster : le contenu, plus la
 * version LUE ; une version périmée est refusée (409), jamais écrasée.
 */
export const adjustResupplyTemplateSchema = resupplyTemplateContentSchema
  .extend({ version: z.number().int().positive() })
  .strict();
export type AdjustResupplyTemplatePayload = z.infer<typeof adjustResupplyTemplateSchema>;

/**
 * Pourquoi une ligne ne s'appliquerait pas aujourd'hui : l'article a quitté
 * le catalogue du réassort, ou son unité de vente a changé depuis. Le modèle
 * n'est jamais corrigé en douce ; la lecture le dit.
 */
export const RESUPPLY_TEMPLATE_LINE_ISSUES = ["withdrawn", "sale_unit_changed"] as const;
export type ResupplyTemplateLineIssue = (typeof RESUPPLY_TEMPLATE_LINE_ISSUES)[number];

/** Une ligne lue, confrontée au catalogue du réassort d'aujourd'hui. */
export interface ResupplyTemplateLineView {
  readonly sku: string;
  readonly quantity: number;
  readonly saleUnit: OrderSaleUnit;
  /** Le nom publié de l'article ; `null` s'il a quitté le catalogue. */
  readonly articleName: string | null;
  /** `null` : la ligne s'applique. */
  readonly issue: ResupplyTemplateLineIssue | null;
}

/** Un modèle actif, tel que la bibliothèque du point le liste. */
export interface ResupplyTemplateView {
  readonly id: string;
  readonly version: number;
  readonly siteId: string;
  readonly name: string;
  readonly target: ResupplyTarget;
  readonly lines: readonly ResupplyTemplateLineView[];
  /** Le dernier ajustement : son auteur (nom figé) et son instant ISO. */
  readonly updatedByName: string;
  readonly updatedAt: string;
}

/** Créer et ajuster : l'identité et la version écrite, que l'écran relira. */
export interface SavedResupplyTemplateResponse {
  readonly id: string;
  readonly version: number;
}
