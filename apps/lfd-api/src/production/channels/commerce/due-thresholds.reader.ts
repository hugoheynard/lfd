import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * - `deadline` : « avant `before` » ;
 * - `undated` : les commandes sans échéance — toujours le dernier seuil, signalé ;
 * - `day` : marges non réglées — un seul seuil, la journée.
 */
export type DueThresholdKind = "deadline" | "undated" | "day";

/** Un seuil du compte à rebours d'un SKU. */
export interface DueThreshold {
  readonly kind: DueThresholdKind;
  /** `HH:mm`, seulement pour `deadline`. */
  readonly before: string | null;
  /** Ce que ce seuil ajoute au précédent. */
  readonly quantity: number;
  /** Ce qui doit être sorti avant ce seuil, tout compris. */
  readonly cumulative: number;
}

/** Le compte à rebours d'un SKU sur la journée, seuils triés par heure. */
export interface SkuDueThresholds {
  readonly sku: string;
  readonly productName: string;
  readonly total: number;
  readonly thresholds: readonly DueThreshold[];
}

/** Ce que le commerce rend pour une journée : ses marges, et les seuils par SKU. */
export interface DayDueThresholds {
  /** En minutes ; `null` = non réglée. Rendues pour que l'écran dise POURQUOI il n'y a qu'un seuil. */
  readonly deliveryMarginMinutes: number | null;
  readonly pickupMarginMinutes: number | null;
  /** Triés par SKU : un ordre stable. L'ordre d'affichage appartient à l'écran. */
  readonly items: readonly SkuDueThresholds[];
}

/**
 * **Avant quelle heure sortir quoi** — l'aperçu du compte à rebours d'une
 * journée (plan production par vagues, V0 et §7.2).
 *
 * Un port à lui, pas une méthode de plus sur `DayOrdersReader` ni sur
 * `ExpectedProductionReader` (ISP) : la clôture et le prévisionnel ne posent
 * pas cette question, et l'échéance d'une commande, ses marges et la règle qui
 * les combine appartiennent au commerce. La production reçoit des seuils, ni
 * une fenêtre, ni un mode, ni une tournée — §7 : elle ne parle jamais à la
 * livraison.
 *
 * ⚠️ **Il vit dans `channels/commerce/`, et l'emplacement EST la frontière** —
 * même motif que ses voisins : déclaré ici, implémenté par le commerce, relié
 * dans `appBootstrap`.
 *
 * ⚠️ **Lecture de prévision** : il lit les commandes du plan (les mêmes que la
 * clôture absorbe). Une journée close n'en a plus — ses seuils figés sont le
 * lot V1, pas ce port.
 */
export abstract class DueThresholdsReader {
  abstract dueThresholdsFor(day: ServiceDay): Promise<DayDueThresholds>;
}
