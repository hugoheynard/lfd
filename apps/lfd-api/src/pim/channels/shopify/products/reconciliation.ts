import type { ShopifyProductSnapshot } from "@lfd/shopify-admin";
import type { FieldDiffView, ReconciliationStatus } from "@lfd/pim-contracts";

import { fingerprint, type ShopifyProductPayload } from "./projection.js";

/**
 * Réconciliation à trois voies — la **logique pure** (aucun réseau, aucune base). Voir
 * `documentation/lfc/publication-reconciliation-3way.md`.
 *
 * Deux régimes d'empreinte, volontairement :
 * - **dérive locale** (OURS vs BASE) → empreinte *pleine* (`fingerprint`) : les deux
 *   côtés portent les options, on détecte donc jusqu'au changement d'option.
 * - **dérive distante** (THEIRS vs BASE) → empreinte *comparable* : Shopify n'expose pas
 *   les options en lecture, on compare donc sur le **dénominateur commun** (titre, statut,
 *   et par déclinaison : SKU, titre, prix). Comparer les formats bruts ferait mentir le diff.
 */

/** Forme de comparaison commune aux trois états — ce que Shopify *rend* aussi. */
export interface Comparable {
  readonly handle: string;
  readonly title: string;
  /** `ACTIVE` | `DRAFT` | `ARCHIVED` (côté distant) — gardé tel quel pour distinguer. */
  readonly status: string;
  readonly variants: readonly ComparableVariant[];
}

/**
 * Déclinaison comparable : **SKU + prix uniquement**. Le *titre* de déclinaison est
 * exclu à dessein — Shopify le contrôle (une mono-déclinaison devient « Default Title »,
 * une multi-déclinaison le dérive des options). Le comparer produirait une fausse dérive
 * distante sur chaque produit dès le premier push (vérifié live, boutique de dev).
 */
export interface ComparableVariant {
  readonly sku: string;
  readonly price: string | null;
}

function sortVariants(variants: readonly ComparableVariant[]): ComparableVariant[] {
  return [...variants].sort((a, b) => a.sku.localeCompare(b.sku));
}

/** OURS/BASE (`ShopifyProductPayload`) → comparable : on **laisse tomber les options**. */
export function comparableFromPayload(payload: ShopifyProductPayload): Comparable {
  return {
    handle: payload.handle,
    title: payload.title,
    status: payload.status,
    variants: sortVariants(payload.variants.map((v) => ({ sku: v.sku, price: v.price }))),
  };
}

/** THEIRS (`ShopifyProductSnapshot`) → comparable. Un SKU distant absent devient `''`. */
export function comparableFromRemote(snapshot: ShopifyProductSnapshot): Comparable {
  return {
    handle: snapshot.handle,
    title: snapshot.title,
    status: snapshot.status,
    variants: sortVariants(snapshot.variants.map((v) => ({ sku: v.sku ?? "", price: v.price }))),
  };
}

/** Empreinte de la forme comparable — stable (déjà triée) et sans options. */
export function comparableHash(comparable: Comparable): string {
  const canonical: ShopifyProductPayload = {
    handle: comparable.handle,
    title: comparable.title,
    status: comparable.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
    variants: comparable.variants.map((v) => ({
      sku: v.sku,
      title: "",
      options: {},
      price: v.price,
    })),
  };
  // On réutilise l'empreinte pleine sur une forme aux options vidées : même algorithme,
  // même garantie de tri ; seul le contenu « options » est neutralisé.
  return `${comparable.status}:${fingerprint(canonical)}`;
}

/** État distant vu du BASE : aligné, dérivé (ou disparu), ou inconnu (dry-run/offline). */
export type RemoteVerdict = "aligned" | "drift" | "unknown";

export interface StatusInput {
  readonly hasOurs: boolean;
  readonly hasBase: boolean;
  readonly localAhead: boolean;
  readonly remote: RemoteVerdict;
}

/**
 * La table de vérité §3 du design, rendue exécutable. `unknown` (silence distant) ne
 * devient **jamais** une dérive : on rapporte alors ce qu'on sait localement.
 */
export function statusFor(input: StatusInput): ReconciliationStatus {
  if (!input.hasOurs) {
    return "to_remove";
  }
  if (!input.hasBase) {
    return "never_published";
  }
  if (input.remote === "unknown") {
    return input.localAhead ? "local_ahead" : "unknown";
  }
  const remoteDrift = input.remote === "drift";
  if (input.localAhead && remoteDrift) {
    return "conflict";
  }
  if (input.localAhead) {
    return "local_ahead";
  }
  if (remoteDrift) {
    return "remote_drift";
  }
  return "up_to_date";
}

/** Diff champ à champ entre deux formes comparables — ce qui a bougé, lisible. */
export function diffComparable(before: Comparable, after: Comparable): FieldDiffView[] {
  const diffs: FieldDiffView[] = [];
  push(diffs, "Titre", before.title, after.title);
  push(diffs, "Statut", before.status, after.status);
  push(diffs, "Déclinaisons", describeVariants(before.variants), describeVariants(after.variants));
  return diffs;
}

function push(diffs: FieldDiffView[], field: string, before: string, after: string): void {
  if (before !== after) {
    diffs.push({ field, before, after });
  }
}

function describeVariants(variants: readonly ComparableVariant[]): string {
  return variants.map((v) => `${v.sku} @ ${v.price ?? "—"}`).join(" · ");
}
