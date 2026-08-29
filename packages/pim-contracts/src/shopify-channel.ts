/**
 * Le canal **Shopify** vu du back-office : réglages, vérification de connexion,
 * inspection du catalogue, poussée des collections de TVA.
 *
 * Ces six formes vivaient en double — côté service backend, et recopiées dans
 * `pim/channels/shopify-channel-api.ts`. Le front en tirait ses six derniers
 * types d'API non contractuels.
 */

import type { ChannelMode } from "./shopify.js";

export type { ChannelMode };

export interface ShopifySettingsView {
  readonly shopDomain: string;
  readonly apiVersion: string;
  readonly isEnabled: boolean;
  /** Présence d'un moyen d'authentification (jeton legacy **ou** client credentials) —
   *  **jamais** le secret lui-même. Nom historique conservé (contrat lu par le front). */
  readonly hasToken: boolean;
  /** `dry-run` tant que l'intégration n'est pas activée **et** approvisionnée. */
  readonly mode: ChannelMode;
  readonly updatedAt: string | null;
}

export interface ShopifySettingsInput {
  readonly shopDomain: string;
  readonly apiVersion: string;
  readonly isEnabled: boolean;
}

export interface VerifyResult {
  readonly mode: ChannelMode;
  /** La boutique a-t-elle répondu ? En simulation, toujours `false`. */
  readonly connected: boolean;
  /** Nom de la boutique confirmé par Shopify, si connectée. */
  readonly shopName: string | null;
  /** Message lisible pour l'écran (raison du dry-run, ou de l'échec). */
  readonly detail: string;
}

/** Ce que l'écran d'inspection affiche : l'état distant + le mode qui l'a produit. */
export interface CatalogueInspection {
  readonly mode: ChannelMode;
  readonly products: readonly ShopifyProductSnapshot[];
}

/** Une collection désirée rapprochée de son éventuelle contrepartie distante. */
/** Une déclinaison, telle que la boutique la montre. */
export interface ShopifyVariantSnapshot {
  readonly sku: string | null;
  readonly title: string;
  readonly price: string | null;
}

/**
 * Un produit tel qu'il existe **aujourd'hui** sur la boutique (miroir distant).
 *
 * Même frontière que `ShopifyCollection` : `@lfd/shopify-admin` en porte une
 * version, qui décrit l'API de Shopify. Celle-ci décrit la NÔTRE.
 */
export interface ShopifyProductSnapshot {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly status: string;
  readonly variants: readonly ShopifyVariantSnapshot[];
}

/**
 * Une collection **telle que NOTRE API la rend**.
 *
 * ⚠️ `@lfd/shopify-admin` en porte une qui lui ressemble — et ce n'est pas un
 * doublon à supprimer. Celle-là décrit ce que l'API de SHOPIFY renvoie ; celle-ci
 * décrit ce que la nôtre renvoie. Les deux coïncident aujourd'hui, et rien ne
 * garantit qu'elles coïncideront demain : le jour où l'on ajoutera un champ à
 * nous, ou où Shopify en retirera un, les faire partager un type transformerait
 * un changement d'API tierce en changement de contrat.
 *
 * Et un paquet de contrats doit rester consommable par un front sans lui
 * imposer un paquet de TRANSPORT.
 */
export interface ShopifyCollection {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly productCount: number;
}

/** Ce que l'on veut voir exister côté boutique — un handle et un titre. */
export interface DesiredCollection {
  readonly handle: string;
  readonly title: string;
}

export interface ReconcileRow {
  readonly handle: string;
  readonly title: string;
  readonly present: boolean;
  /** La collection distante rapprochée, si elle existe. */
  readonly remote: ShopifyCollection | null;
}

export interface Reconciliation {
  readonly rows: readonly ReconcileRow[];
  /** Collections `tva-*` sur la boutique que plus aucune désirée ne réclame. */
  readonly orphans: readonly ShopifyCollection[];
  readonly missingCount: number;
}

export interface InspectResult {
  readonly mode: ChannelMode;
  readonly reconciliation: Reconciliation;
}

export interface PushResult {
  readonly mode: ChannelMode;
  /** Collections effectivement créées pendant ce push. */
  readonly created: readonly ShopifyCollection[];
  /** État après push — la boucle se referme en un aller-retour. */
  readonly reconciliation: Reconciliation;
}
