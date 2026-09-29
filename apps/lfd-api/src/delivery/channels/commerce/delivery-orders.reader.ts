import type { BillingAddressPayload, GpsPoint } from "@lfd/contracts";

import type { DepartureSheet } from "../../domain/entities/departure-sheet.js";

/**
 * Ce que la livraison sait d'une commande : de quoi la répartir et la
 * signaler. **Aucun montant.** Le détail d'un arrêt est celui de la feuille de
 * route (plan de tournée, lot 3, C4) ; il se fige au départ
 * (`departureSheetsOf`, lot 4).
 *
 * ⚠️ **Réécrit le 2026-09-29 (lot 7, L7-C8).** Ce canal s'engageait à ne
 * servir « aucune adresse » avant le départ. Le calculateur de tournée en a
 * besoin pour situer un arrêt : `stopPointsOf` rend le point GPS du carnet et
 * l'adresse livrée FIGÉE à la passation — celle que la commande porte depuis
 * sa création, pas le carnet vivant. La livraison ne lit toujours pas
 * `public.address` : c'est le commerce qui lit, sous le mur.
 *
 * `status` est RÉDUIT à ce que la composition distingue : `cancelled` ou
 * `active`. L'énuméré des statuts reste au commerce.
 */
export interface DeliveryOrderRef {
  readonly orderId: string;
  readonly reference: string;
  readonly status: "active" | "cancelled";
}

/** Une commande relue par son identifiant, où qu'elle en soit aujourd'hui. */
export interface DeliveryOrderFacts extends DeliveryOrderRef {
  /**
   * La raison sociale, ou le nom de qui a commandé — la règle de la file du
   * comptoir. Ce qu'on lit sur l'étiquette d'un sac (lot 4).
   */
  readonly customerLabel: string;
  /** Son jour demandé aujourd'hui (`AAAA-MM-JJ`), ou `null`. */
  readonly day: string | null;
  /** Encore en livraison, ou passée en retrait au comptoir. */
  readonly delivery: boolean;
}

/** Une fenêtre convenue, `HH:MM` ; `start` nul = « dès l'ouverture ». */
export interface DeliveryStopWindow {
  readonly start: string | null;
  readonly end: string;
}

/**
 * **Où livrer une commande**, pour le calculateur (lot 7, L7-C1, L7-C8) : de
 * quoi la situer et la chronométrer, rien d'autre — ni contact, ni note, ni
 * montant.
 */
export interface DeliveryStopPoint {
  readonly orderId: string;
  readonly reference: string;
  /**
   * Le point GPS de l'adresse du carnet à laquelle la commande est RELIÉE, lu
   * sous le mur `(adresse, société)` ; `null` sans lien, ou sans point saisi.
   * Il passe avant tout géocodage (L7-Q1).
   */
  readonly gps: GpsPoint | null;
  /** L'adresse livrée figée à la passation, ou `null`. */
  readonly address: BillingAddressPayload | null;
  /** La fenêtre convenue (un défaut du carnet n'est pas une promesse, lot 1). */
  readonly window: DeliveryStopWindow | null;
}

/**
 * **Les livraisons, vues par la composition** — ce que la livraison DÉCLARE et
 * que le commerce implémente (`b2b/orders/infrastructure/`), relié dans
 * `appBootstrap` (C4, C15).
 *
 * La livraison ne lit pas `public.orders` : le filtre « attendue ce jour »
 * est celui de la file du comptoir et de la feuille de route, écrit UNE fois
 * côté commerce (`expectedOnWhere`). Deux lecteurs, une vérité.
 */
export abstract class DeliveryOrdersReader {
  /**
   * Les livraisons attendues ce jour-là, annulées COMPRISES (c'est au statut
   * de le dire), brouillons exclus.
   */
  abstract expectedOn(day: string): Promise<readonly DeliveryOrderRef[]>;

  /** Ces commandes, quel que soit leur jour, leur mode ou leur statut. Les inconnues sont absentes. */
  abstract byIds(orderIds: readonly string[]): Promise<readonly DeliveryOrderFacts[]>;

  /**
   * **Ce que verra le livreur**, lu au moment de « Partir » pour être FIGÉ
   * (lot 4, « snapshot au départ ») : adresse livrée, contact, fenêtre,
   * signature, note — aucun montant. Les inconnues sont absentes.
   */
  abstract departureSheetsOf(orderIds: readonly string[]): Promise<readonly DepartureSheet[]>;

  /**
   * **Où livrer ces commandes** (lot 7, L7-C8) : point GPS du carnet, adresse
   * livrée figée, fenêtre. Les inconnues sont absentes.
   */
  abstract stopPointsOf(orderIds: readonly string[]): Promise<readonly DeliveryStopPoint[]>;
}
