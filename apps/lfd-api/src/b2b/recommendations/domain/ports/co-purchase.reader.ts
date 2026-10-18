import type { ShopAudience } from "../../../catalog/domain/ports/catalog.reader.js";
import type { CoPurchasePair } from "../services/bought-with.js";

/** Ce qu'on demande aux commandes : les paires d'un panier, pour une clientèle. */
export interface CoPurchaseAsk {
  /** Les articles du panier. */
  readonly anchors: readonly string[];
  /** Les commandes de cette clientèle seulement : un pro ne lit pas les paniers des particuliers. */
  readonly audience: ShopAudience;
  /** Premier jour métier de la fenêtre `AAAA-MM-JJ` (jour de passation, Paris), compris. */
  readonly since: string;
  /** Le seuil d'anonymat : une paire sous lui ne sort pas de la base. */
  readonly minClients: number;
  readonly limit: number;
}

/**
 * Port de **lecture** des co-occurrences (R2) — déclaré par la
 * recommandation, implémenté par la commande, comme `SuggestedSkuSalesReader`.
 *
 * 🔴 Il ne rend QUE des comptes de paires : ni commande, ni société, ni
 * personne. Le client compté sert au `COUNT(DISTINCT)` et ne quitte pas la
 * requête ; une paire sous `minClients` n'en sort pas non plus. Les paires
 * traversent les comptes sans traverser le mur, parce qu'elles ne disent
 * qui que ce soit.
 */
export abstract class CoPurchaseReader {
  /**
   * Les paires (article du panier, autre article) commandées dans une même
   * commande depuis `since`, au soutien décroissant. Un article du panier
   * n'est jamais rendu en `withSku`.
   */
  abstract pairs(ask: CoPurchaseAsk): Promise<readonly CoPurchasePair[]>;
}
