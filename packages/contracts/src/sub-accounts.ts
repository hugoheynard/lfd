import { z } from "zod";

import type { CompanyStatus } from "./customer-sheet.js";
import { deliveryAddressPayloadSchema } from "./address.js";

/**
 * **Les sous-comptes d'un compte pro** — plan
 * `documentation/b2b/plan-sous-comptes.md` (lot S1).
 *
 * Un sous-compte EST une société (§1) : il commande, il est livré, il a ses
 * adresses. Ce qui est neuf se limite au LIEN vers son principal et aux
 * ASPECTS qu'il en suit, chacun par période datée (§2.1).
 */

/**
 * Ce qu'un sous-compte peut suivre de son principal (§2.1) :
 *
 * - `billing` — facturé ET prélevé au nom du principal (identité et RIB vont
 *   ensemble, Q3) ;
 * - `pricing` — la mercuriale et les engagements du principal. Décidé par le
 *   commercial, derrière le droit de tarification (Q9) ;
 * - `contacts` — un contact du principal partagé avec le sous-compte.
 */
export const COMPANY_FOLLOW_ASPECTS = ["billing", "pricing", "contacts"] as const;
export type CompanyFollowAspect = (typeof COMPANY_FOLLOW_ASPECTS)[number];
export const companyFollowAspectSchema = z.enum(COMPANY_FOLLOW_ASPECTS);

/**
 * Les aspects qu'on suit depuis la fiche client (`b2b_companies`). `pricing`
 * n'y est PAS : il a sa route, derrière `b2b_pricing` (Q9).
 */
export const companyFicheFollowAspectSchema = z.enum(["billing", "contacts"]);

/** Une société citée : de quoi faire un lien et l'afficher. */
export interface CompanyRefView {
  readonly id: string;
  readonly enseigne: string;
}

/** Le principal d'un sous-compte, avec son statut : le suivi `billing` en dépend. */
export interface ParentCompanyView extends CompanyRefView {
  readonly status: CompanyStatus;
}

/** Un aspect suivi EN COURS, et depuis quand (ISO). */
export interface FollowedAspectView {
  readonly aspect: CompanyFollowAspect;
  readonly since: string;
}

/** Un sous-compte, tel que la fiche de son principal le liste (§4). */
export interface SubAccountView {
  readonly id: string;
  readonly enseigne: string;
  /** La ville de l'adresse de livraison par défaut, ou `null` s'il n'en a pas. */
  readonly city: string | null;
  readonly status: CompanyStatus;
  readonly followedAspects: readonly CompanyFollowAspect[];
}

/** La place d'une société dans la hiérarchie des comptes, telle que la fiche la montre. */
export interface CompanyHierarchyView {
  /** Le principal, ou `null` : ce compte n'est le sous-compte de personne. */
  readonly parent: ParentCompanyView | null;
  /** Ses sous-comptes — vide pour un sous-compte (profondeur 1). */
  readonly subAccounts: readonly SubAccountView[];
  /** Les aspects qu'il suit en ce moment. Vide sans principal. */
  readonly follows: readonly FollowedAspectView[];
  /** « Compte de groupe, sans livraison » (§4). */
  readonly groupWithoutDelivery: boolean;
}

/**
 * `POST /admin/companies/:companyId/sub-accounts` — créer un sous-compte de
 * `:companyId`. Identité, première adresse de livraison, aspects à suivre.
 * Les règles (SIRET, longueurs, profondeur) sont celles du domaine : ce
 * schéma ne tient que la forme.
 */
export const createSubAccountPayloadSchema = z.strictObject({
  raisonSociale: z.string().default(""),
  enseigne: z.string(),
  formeJuridique: z.string().default(""),
  siret: z.string().default(""),
  siren: z.string().default(""),
  vatNumber: z.string().default(""),
  deliveryAddress: deliveryAddressPayloadSchema,
  follows: z.array(companyFollowAspectSchema).default([]),
});
export type CreateSubAccountPayload = z.infer<typeof createSubAccountPayloadSchema>;

/** `POST /admin/companies/:companyId/parent` — rattacher à un principal. */
export const attachToParentPayloadSchema = z.strictObject({ parentId: z.string().min(1) });
export type AttachToParentPayload = z.infer<typeof attachToParentPayloadSchema>;

/** `POST /admin/companies/:companyId/follows` (et `/follows/stop`) — hors `pricing`. */
export const followAspectPayloadSchema = z.strictObject({ aspect: companyFicheFollowAspectSchema });
export type FollowAspectPayload = z.infer<typeof followAspectPayloadSchema>;

/** `POST /admin/companies/:companyId/group-without-delivery`. */
export const groupWithoutDeliveryPayloadSchema = z.strictObject({ enabled: z.boolean() });
export type GroupWithoutDeliveryPayload = z.infer<typeof groupWithoutDeliveryPayloadSchema>;
