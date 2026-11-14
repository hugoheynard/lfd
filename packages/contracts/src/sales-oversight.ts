import { z } from "zod";

/**
 * **Le suivi commercial** — la page de la cheffe des commerciaux
 * (`GET /admin/sales-oversight`, droit `b2b_sales_oversight`,
 * `documentation/b2b/plan-suivi-commercial.md`, § 1 et § 3.3) : un seul
 * tableau, une ligne par fiche principale, filtrable par commercial.
 *
 * Aucune donnée de contact du prospect n'y circule : ce qui manque se dit par
 * un mot (`interlocutor`), jamais par l'e-mail ou le téléphone eux-mêmes.
 */

/** Les niveaux de travail, du plus bas au plus haut. */
export const SALES_WORK_LEVELS = [
  "directory",
  "contacted",
  "qualified",
  "opened",
  "active",
] as const;
export const salesWorkLevelSchema = z.enum(SALES_WORK_LEVELS);
export type SalesWorkLevel = z.infer<typeof salesWorkLevelSchema>;

/** Ce qui manque à une fiche, un mot par manque. */
export type SalesWorkGap =
  | "interlocutor"
  | "noted_contact"
  | "billing_address"
  | "delivery_address"
  | "holder_login"
  | "activation"
  | "first_order";

/**
 * Les signaux, qui ne sont pas des niveaux : `late` (resté trop longtemps à
 * Annuaire ou Contactée), `access_resent` (accès envoyé deux fois ou plus sans
 * connexion du détenteur), `multiple_addresses` (plus d'une adresse de
 * livraison vivante — un lieu de plus est un site).
 */
export const SALES_OVERSIGHT_SIGNALS = ["late", "access_resent", "multiple_addresses"] as const;
export const salesOversightSignalSchema = z.enum(SALES_OVERSIGHT_SIGNALS);
export type SalesOversightSignal = z.infer<typeof salesOversightSignalSchema>;

/** Le canal d'ouverture : par l'équipe (`commercial`) ou par le client (`self`). */
export const SALES_OVERSIGHT_CHANNELS = ["commercial", "self"] as const;
export const salesOversightChannelSchema = z.enum(SALES_OVERSIGHT_CHANNELS);
export type SalesOversightChannel = z.infer<typeof salesOversightChannelSchema>;

/** Le filtre commercial qui retient les fiches qu'aucun commercial ne suit. */
export const SALES_OVERSIGHT_UNASSIGNED = "unassigned";

/** Une page du tableau. */
export const SALES_OVERSIGHT_PAGE_SIZE = 50;

/**
 * La FORME des filtres. `follower` absent : toute l'équipe ; `"unassigned"` :
 * les fiches sans commercial ; sinon l'id de fiche staff du commercial.
 */
export const salesOversightQuerySchema = z.object({
  follower: z.string().trim().min(1).optional(),
  level: salesWorkLevelSchema.optional(),
  signal: salesOversightSignalSchema.optional(),
  channel: salesOversightChannelSchema.optional(),
  /** Pagination numérotée, à partir de 1. */
  page: z.coerce.number().int().min(1).default(1),
});
export type SalesOversightQuery = z.infer<typeof salesOversightQuerySchema>;

/** Le commercial qui suit une fiche. `archived` : il n'est plus dans l'équipe. */
export interface SalesOversightFollowerView {
  readonly id: string;
  /** `null` : la fiche staff ne porte pas de nom, ou l'id ne désigne plus personne. */
  readonly name: string | null;
  readonly archived: boolean;
}

/** Une ligne du tableau : une fiche principale (jamais un site). */
export interface SalesOversightRowView {
  readonly companyId: string;
  readonly reference: string;
  readonly name: string;
  readonly level: SalesWorkLevel;
  /** Ce qui manque sous le niveau atteint et pour le suivant ; vide à « active ». */
  readonly missing: readonly SalesWorkGap[];
  /** Jours pleins depuis l'ouverture de la fiche. */
  readonly ageDays: number;
  readonly followedBy: SalesOversightFollowerView | null;
  /** `null` : fiche antérieure à la trace du canal. */
  readonly declaredVia: "self" | "staff" | null;
  readonly signals: readonly SalesOversightSignal[];
  /** Demandes d'envoi de l'accès client (`customer.access-opened`). */
  readonly accessSentCount: number;
  /** ISO ; `null` sans envoi. */
  readonly lastAccessSentAt: string | null;
  /** Adresses de livraison vivantes. */
  readonly deliveryAddressCount: number;
}

/** Un commercial proposé au filtre : actif, et qui suit au moins une fiche. */
export interface SalesOversightFollowerOption {
  readonly id: string;
  readonly name: string | null;
}

export interface SalesOversightView {
  /** Les fiches par niveau, selon les filtres commercial, canal et signal. */
  readonly counts: Readonly<Record<SalesWorkLevel, number>>;
  readonly rows: readonly SalesOversightRowView[];
  readonly page: number;
  readonly pageSize: number;
  /** Les fiches qui passent TOUS les filtres, niveau compris. */
  readonly total: number;
  readonly followers: readonly SalesOversightFollowerOption[];
}
