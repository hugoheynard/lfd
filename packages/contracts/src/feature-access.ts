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
 * - **le défaut du code est l'état d'avant ce module** (`order` pour `shop`) :
 *   rien ne se ferme au déploiement, la fermeture est un geste d'admin.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Le catalogue — dans un module sans zod, pour le poids des fronts
// ─────────────────────────────────────────────────────────────────────────────

import type { FeatureKey, FeatureLevel } from "./feature-access.levels.js";

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

// ─────────────────────────────────────────────────────────────────────────────
// Ce qui sort
// ─────────────────────────────────────────────────────────────────────────────

/** `GET /feature-access` — les niveaux GLOBAUX, sans exemption. Public. */
export type FeatureLevelsView = { readonly [Key in FeatureKey]: FeatureLevel<Key> };

/** Qui a posé un écart, figé à l'instant du geste. */
export interface FeatureAccessAuthorView {
  readonly sub: string;
  /** Vide quand l'annuaire ne connaissait pas le `sub` ce jour-là. */
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
   * `false` : aucune exemption ne s'applique ni ne s'ajoute, et l'écran ne
   * propose pas la liste. Ajouté le 2026-09-14 avec `customerMandate`.
   */
  readonly exemptible: boolean;
  /** `null` = défaut du code. */
  readonly override: FeatureOverrideView | null;
  readonly exemptions: readonly FeatureExemptionView[];
}

/**
 * Une ligne de base que le catalogue ne sait pas lire : clé disparue, ou valeur
 * qui n'est plus un niveau de sa clé. **Signalée, jamais interprétée.**
 */
export interface IgnoredFeatureRowView {
  readonly table: "override" | "exemption";
  readonly key: string;
  /** La valeur de la dérogation, ou l'adresse de l'exemption. */
  readonly detail: string;
  readonly reason: "unknown_key" | "unknown_level";
}

/** `GET /admin/feature-access`. */
export interface AdminFeatureAccessView {
  readonly features: readonly AdminFeatureView[];
  readonly ignored: readonly IgnoredFeatureRowView[];
}
