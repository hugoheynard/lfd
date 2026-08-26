import { sellsContext, type SalesChannels } from "./sales-channels.js";

/**
 * Une **manière de vendre** qui a son propre traitement de TVA — et donc, chez
 * Shopify, sa propre collection `tva-*`.
 *
 * C'est une DONNÉE, lue d'une table : ajouter « borne libre-service » ou
 * « marché » doit être une ligne, pas une migration plus un déploiement. Le
 * code ne connaît plus la liste ; il l'itère.
 */
export interface SalesContext {
  readonly id: string;
  /** Identité stable, celle que le code cite quand il doit citer (`b2b`). */
  readonly key: string;
  readonly label: string;
  /**
   * Suffixe de handle **Shopify** — vide pour le contexte par défaut, dont le
   * handle nu protège les URL déjà indexées (C0-bis, write-once SEO).
   *
   * Du vocabulaire de CE canal, donc vide aussi pour un contexte qui n'y est
   * pas projeté : le B2B a son propre projecteur, qui ne fabrique aucun handle.
   *
   * ⚠️ Deux contextes PROJETÉS ne peuvent pas partager un suffixe — ils
   * produiraient le même handle. Rien ne le vérifie encore : aucun canal ne lit
   * ce champ à ce jour, il attend C4 et ses handles suffixés. C'est là que
   * l'invariant devra vivre, pas ici.
   */
  readonly handleSuffix: string;
  /** En service : réglable à l'écran, et facturable. */
  readonly active: boolean;
  /** Shopify en fait un produit. **Distinct** de `active` — cf. le schéma. */
  readonly shopifyProjected: boolean;
  readonly position: number;
}

/**
 * Le taux visé par une famille, **par clé de contexte**. Une clé absente n'est
 * pas un taux nul : c'est l'absence de réglage, et les deux se distinguent.
 */
export type ContextVat = Readonly<Record<string, string>>;

/**
 * Ce contexte est-il vendu par cette matrice ?
 *
 * **Une ligne, et aucune branche.** Elle en avait une — « si c'est le B2B, lire
 * le drapeau, sinon chercher le mode » — parce que la matrice séparait les deux.
 * Depuis qu'elle est un ensemble de paires, la question ne dépend plus de quel
 * contexte on regarde : le nom suffit, et personne n'a besoin de savoir lequel
 * a un lieu.
 */
export function contextIsSold(context: SalesContext, channels: SalesChannels): boolean {
  return sellsContext(channels, context.key);
}

/**
 * Le taux EFFECTIF d'un produit : sa dérogation par-dessus celle de sa famille.
 *
 * Une seule ligne, mais c'est LA règle de résolution, et elle vit ici pour
 * qu'il n'y en ait qu'une : deux canaux qui la réécriraient chacun de leur côté
 * factureraient un jour deux taux différents pour le même article.
 *
 * Contexte par contexte : un produit peut déroger en B2B et suivre sa famille
 * au comptoir. C'est le cas courant, pas l'exception.
 */
export function effectiveVat<T>(
  family: Readonly<Record<string, T>>,
  product: Readonly<Record<string, T>>,
): Readonly<Record<string, T>> {
  return { ...family, ...product };
}
