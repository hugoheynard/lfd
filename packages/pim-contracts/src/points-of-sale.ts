import { z } from "zod";

/**
 * Contrat de fil des **points de vente** — d'où l'on vend.
 *
 * Il remplace celui des « emplacements ». Deux différences qui ne sont pas des
 * renommages : la plateforme professionnelle y a sa place (elle n'était qu'un
 * `NULL` dans la matrice de canaux), et les modes de vente `clickCollect` /
 * `eatIn` sont devenus une LISTE de contextes offerts — en ajouter un ne
 * demande plus une colonne, un champ de charge et un déploiement.
 */

/** Borne dure du nombre de tables (miroir de `MAX_TABLES` côté domaine backend). */
export const MAX_TABLES = 200;

const tableCountSchema = z.number().int().min(0).max(MAX_TABLES);

/** `shop` = boutique physique ; `platform` = plateforme de commande (le B2B). */
export type PointOfSaleKindView = "shop" | "platform";

export const openShopPayloadSchema = z.object({
  label: z.string().min(1),
  baseUrl: z.string(),
  /** Les clés de contexte offertes — le registre décide de ce qui existe. */
  contexts: z.array(z.string()),
  tableCount: tableCountSchema,
});
export type OpenShopPayload = z.infer<typeof openShopPayloadSchema>;

export const updatePointOfSalePayloadSchema = z.object({
  label: z.string().min(1).optional(),
  baseUrl: z.string().optional(),
  contexts: z.array(z.string()).optional(),
  tableCount: tableCountSchema.optional(),
});
export type UpdatePointOfSalePayload = z.infer<typeof updatePointOfSalePayloadSchema>;

/** Vue d'une table : `number` verrouillé, `token` présent une fois le QR généré. */
export interface TableView {
  readonly number: number;
  readonly qrCreated: boolean;
  readonly token: string | null;
}

/** Vue d'un point de vente telle que l'API la rend. */
export interface PointOfSaleView {
  readonly id: string;
  readonly kind: PointOfSaleKindView;
  readonly label: string;
  /** Boutique seulement — `null` pour une plateforme. */
  readonly baseUrl: string | null;
  /** Les clés de contexte qu'il OFFRE ; ce qu'on y vend est une autre question. */
  readonly contexts: readonly string[];
  readonly tables: readonly TableView[];
  /**
   * Combien de **familles** vendent depuis ce point de vente.
   *
   * Voyage avec la vue pour que l'écran le DISE avant le clic : le référentiel
   * refuse de supprimer un point de vente encore vendeur, et un bouton dont on
   * sait qu'il échouera n'a pas à être offert.
   */
  readonly usedByCategories: number;
}

/** Réponse de génération de QR : le token neuf minté par le serveur. */
export interface TableQrResponse {
  readonly token: string;
}
