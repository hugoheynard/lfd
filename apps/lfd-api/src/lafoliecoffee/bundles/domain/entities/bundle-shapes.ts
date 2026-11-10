import { InvalidBundleAudienceError, InvalidBundleStatusError } from "../errors/bundle-errors.js";
import type { BundleGroup } from "../value-objects/bundle-composition.js";

/**
 * Les états d'une formule **dans ce lot** (F2a) : brouillon ou retirée.
 *
 * ⚠️ `on_sale` n'y est pas, et c'est délibéré : la mise en vente exige un prix
 * en vigueur (§4.1 du plan), et le prix arrive avec son propre lot. Une
 * VALEUR de donnée, écrite telle quelle en base (`CHECK`) — l'ajouter sera un
 * élargissement, pas une migration de données.
 */
export const BUNDLE_STATUSES = ["draft", "withdrawn"] as const;
export type BundleStatus = (typeof BUNDLE_STATUSES)[number];

/**
 * À qui une formule se vend. **`public` seulement** (D4, Q5 — recommandation
 * retenue le 2026-10-19) : le champ existe pour que l'ouverture aux pros soit
 * un élargissement de valeur, pas une migration.
 */
export const BUNDLE_AUDIENCES = ["public"] as const;
export type BundleAudience = (typeof BUNDLE_AUDIENCES)[number];

/** Qui a écrit, et quand — l'instant vient du `Clock`, l'auteur du `Principal`. */
export interface BundleWrite {
  readonly by: string | null;
  readonly at: Date;
}

/** L'état entier d'une formule, tel qu'on le lit. Immuable. */
export interface BundleSnapshot {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly audience: BundleAudience;
  readonly status: BundleStatus;
  readonly groups: readonly BundleGroup[];
  readonly createdAt: Date;
  readonly writtenAt: Date;
  readonly writtenBy: string | null;
}

/** La formule telle que la base la rend : audience et statut encore bruts. */
export interface BundleRecord extends Omit<BundleSnapshot, "audience" | "status"> {
  readonly audience: string;
  readonly status: string;
}

/** Ce que la création demande. La clé n'y est pas : elle se tire du nom. */
export interface CreateBundle {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly audience: string;
  readonly groups: readonly { readonly label: string; readonly choices: readonly string[] }[];
}

/** @throws {InvalidBundleAudienceError} une clientèle que ce lot n'admet pas. */
export function bundleAudienceOf(raw: string): BundleAudience {
  const audience = BUNDLE_AUDIENCES.find((candidate) => candidate === raw);
  if (audience === undefined) {
    throw new InvalidBundleAudienceError(raw);
  }
  return audience;
}

/** @throws {InvalidBundleStatusError} un état que ce lot ne connaît pas. */
export function bundleStatusOf(raw: string): BundleStatus {
  const status = BUNDLE_STATUSES.find((candidate) => candidate === raw);
  if (status === undefined) {
    throw new InvalidBundleStatusError(raw);
  }
  return status;
}
