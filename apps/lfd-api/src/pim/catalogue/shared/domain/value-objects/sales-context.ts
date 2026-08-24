import { sellsMode, type SalesChannels } from "./sales-channels.js";

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
  /** Suffixe de handle Shopify — **vide** pour le contexte par défaut. */
  readonly handleSuffix: string;
  /**
   * Quel drapeau de la matrice des canaux autorise ce contexte. De TRANSITION :
   * la matrice garde ses clés fixes tant que sa propre refonte n'a pas eu lieu.
   */
  readonly channelKey: SalesChannelKey;
  /** En service : réglable à l'écran, et facturable. */
  readonly active: boolean;
  /** Shopify en fait un produit. **Distinct** de `active` — cf. le schéma. */
  readonly shopifyProjected: boolean;
  readonly position: number;
}

/** Les canaux que la matrice sait porter aujourd'hui. */
export type SalesChannelKey = "emporter" | "surPlace" | "b2b";

/**
 * Le taux visé par une famille, **par clé de contexte**. Une clé absente n'est
 * pas un taux nul : c'est l'absence de réglage, et les deux se distinguent.
 */
export type ContextTva = Readonly<Record<string, string>>;

/**
 * Ce contexte est-il vendu par cette matrice ?
 *
 * Ici plutôt que dans l'agrégat : c'est la seule jointure entre le registre et
 * la matrice, et elle disparaîtra en entier le jour où la matrice deviendra une
 * donnée à son tour.
 */
export function contextIsSold(context: SalesContext, channels: SalesChannels): boolean {
  return context.channelKey === "b2b" ? channels.b2b : sellsMode(channels, context.channelKey);
}
