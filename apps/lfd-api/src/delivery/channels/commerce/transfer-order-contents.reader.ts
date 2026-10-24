import type { DeliveryOrderLine } from "./delivery-order-lines.reader.js";

/**
 * Ce qui range une commande d'un transfert dans sa catégorie de couleur (plan
 * `commandes/back-office/plan-tri-depart-et-couleurs.md`, L1a) : figé à la passation, lu
 * à chaque lecture — jamais recopié dans le manifeste.
 */
export interface TransferOrderCategory {
  /** `pro` / `public` ; `null` = commande d'avant la distinction. */
  readonly clientele: "pro" | "public" | null;
  /** Le site figé à la passation (S2), identifiant opaque ; `null` = d'avant le site. */
  readonly siteId: string | null;
}

/**
 * **Ce que contiennent les commandes d'un transfert interne** — décision de
 * Hugo du 2026-10-13 : « on doit savoir ce qu'on transporte ». Ce que la
 * livraison DÉCLARE et que le commerce implémente
 * (`b2b/orders/infrastructure/`), relié dans `appBootstrap`.
 *
 * Lecteur PAR LOT, à lui (ISP) : `DeliveryOrderLinesReader` lit une commande à
 * la fois pour le colisage, et le manifeste en lit des dizaines. **Aucun
 * montant.** `delivery → b2b` reste interdit : la livraison ne lit jamais
 * `public.order_lines`.
 */
export abstract class TransferOrderContentsReader {
  /**
   * Les lignes de ces commandes (SKU, nom figé à la passation, quantité), par
   * commande, dans l'ordre de la commande. Une commande inconnue est ABSENTE :
   * le manifeste ne lui invente pas de contenu.
   */
  abstract contentsOf(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly DeliveryOrderLine[]>>;

  /**
   * La clientèle et le site de ces commandes, par commande, en UNE lecture.
   * Une commande inconnue est absente : l'écran la peint en teinte neutre.
   */
  abstract categoriesOf(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, TransferOrderCategory>>;
}
