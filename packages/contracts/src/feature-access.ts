import { z } from "zod";

/**
 * **L'accès aux fonctionnalités** : ce qu'on peut faire d'une surface de la
 * plateforme, réglé en admin sans redéployer.
 *
 * Plan et décisions : `documentation/auth-inscription/plan-inscription-pro-seule.md` §2.
 *
 * Trois règles tiennent ce contrat :
 *
 * - **le catalogue vit dans le code**, et la base ne porte que les écarts. Une
 *   clé ou une valeur absente d'ici n'existe pas, quoi que dise une ligne ;
 * - **les valeurs sont ordonnées**, de la plus fermée à la plus ouverte. Une
 *   garde demande « au moins » un niveau, si bien qu'un niveau inséré plus tard
 *   ne demande de rouvrir aucune garde ;
 * - **le défaut du code est l'état d'avant ce module** :
 *   rien ne se ferme au déploiement, la fermeture est un geste d'admin.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Le catalogue — dans un module sans zod, pour le poids des fronts
// ─────────────────────────────────────────────────────────────────────────────

import type { FeatureExemptionKind, FeatureKey, FeatureLevel } from "./feature-access.levels.js";

export * from "./feature-access.levels.js";

// ─────────────────────────────────────────────────────────────────────────────
// Ce qui entre
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pose d'une dérogation. La **forme** seulement : la valeur dépend de la clé
 * portée par l'URL, c'est donc le domaine qui la confronte au catalogue.
 */
export const featureOverridePayloadSchema = z.object({
  value: z.string().trim().min(1).max(64),
});
export type FeatureOverridePayload = z.infer<typeof featureOverridePayloadSchema>;

/** Ajout d'une adresse exemptée. Le format et la normalisation sont au domaine. */
export const featureExemptionPayloadSchema = z.object({
  email: z.string().trim().min(1).max(254),
});
export type FeatureExemptionPayload = z.infer<typeof featureExemptionPayloadSchema>;

/**
 * Ajout d'une société exemptée. L'existence de la société et son archivage
 * sont jugés par le serveur.
 */
export const featureCompanyExemptionPayloadSchema = z.object({
  companyId: z.string().trim().min(1).max(64),
});
export type FeatureCompanyExemptionPayload = z.infer<typeof featureCompanyExemptionPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Ce qui sort
// ─────────────────────────────────────────────────────────────────────────────

/** `GET /feature-access` — les niveaux GLOBAUX, sans exemption. Public. */
export type FeatureLevelsView = { readonly [Key in FeatureKey]: FeatureLevel<Key> };

/**
 * Qui a posé un écart, figé à l'instant du geste : un nom et un rôle, pas un
 * identifiant. Le champ `sub` qu'elle portait n'était lu par aucun écran
 * (vérifié le 2026-09-18) ; il est retiré à l'étape 5A du
 * `documentation/journalisation/architecture-journalisation.md` §12.
 */
export interface FeatureAccessAuthorView {
  /** Vide quand l'annuaire ne connaissait pas l'auteur ce jour-là. */
  readonly name: string;
  readonly role: string;
}

/**
 * L'état du compte qui porte une adresse exemptée.
 *
 * `verified` est la seule valeur qui fait jouer l'exemption : sans preuve
 * d'adresse, n'importe qui pourrait s'inscrire avec l'e-mail d'un testeur et en
 * hériter (plan §2.2).
 */
export type FeatureExemptionAccountState = "verified" | "unverified" | "none";

export interface FeatureExemptionView {
  readonly id: string;
  /** Normalisée : sans espace, en minuscules. */
  readonly email: string;
  readonly createdAt: string;
  readonly createdBy: FeatureAccessAuthorView;
  readonly accountState: FeatureExemptionAccountState;
}

/**
 * Une société exemptée. Son nom est celui du jour de l'ajout : la ligne n'a
 * pas de clé vers la société, et ne la relit pas.
 */
export interface FeatureCompanyExemptionView {
  readonly companyId: string;
  readonly companyName: string;
  readonly createdAt: string;
  readonly createdBy: FeatureAccessAuthorView;
}

/** Une société qu'on peut exempter : une société non archivée, nommée. */
export interface ExemptibleCompanyView {
  readonly id: string;
  readonly name: string;
}

export interface FeatureOverrideView {
  readonly value: string;
  readonly updatedAt: string;
  readonly updatedBy: FeatureAccessAuthorView;
}

/** Une clé du catalogue, telle que l'écran admin la peint. */
export interface AdminFeatureView {
  readonly key: FeatureKey;
  readonly label: string;
  readonly description: string;
  readonly levels: readonly string[];
  readonly defaultLevel: string;
  /** Ce qui s'applique à qui n'est pas exempté. */
  readonly effectiveLevel: string;
  /**
   * Par quoi une exemption ouvre la clé ; `null` : aucune exemption ne
   * s'applique ni ne s'ajoute, et l'écran ne propose pas de liste.
   */
  readonly exemptBy: FeatureExemptionKind | null;
  /** `null` = défaut du code. */
  readonly override: FeatureOverrideView | null;
  /** Les adresses exemptées — vide pour une clé qui ne s'exempte pas par adresse. */
  readonly exemptions: readonly FeatureExemptionView[];
  /** Les sociétés exemptées — vide pour une clé qui ne s'exempte pas par société. */
  readonly companyExemptions: readonly FeatureCompanyExemptionView[];
}

/**
 * Une ligne de base que le catalogue ne sait pas lire : clé disparue, ou valeur
 * qui n'est plus un niveau de sa clé. **Signalée, jamais interprétée.**
 */
export interface IgnoredFeatureRowView {
  readonly table: "override" | "exemption" | "company_exemption";
  readonly key: string;
  /**
   * Ce qui retire la ligne par son geste habituel : l'id d'une exemption par
   * adresse, l'id de la société d'une exemption par société ; `null` pour une
   * dérogation, qui se retire par la clé.
   */
  readonly id: string | null;
  /** La valeur de la dérogation, l'adresse ou le nom de la société exemptée. */
  readonly detail: string;
  /**
   * `exemption_kind_retired` : la clé existe, mais ne s'exempte plus de
   * cette sorte (une adresse sur une clé qui s'ouvre société par société).
   */
  readonly reason: "unknown_key" | "unknown_level" | "exemption_kind_retired";
}

/** `GET /admin/feature-access`. */
export interface AdminFeatureAccessView {
  readonly features: readonly AdminFeatureView[];
  readonly ignored: readonly IgnoredFeatureRowView[];
}
