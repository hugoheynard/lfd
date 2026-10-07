import { Injectable, Logger } from "@nestjs/common";

import { AfterCommit } from "../../platform/database/after-commit.js";
import { BackgroundWork } from "../../platform/events/background-work.js";
import { DeliveryOrderPlacedListener, DeliveryOrdersReader } from "../channels/commerce/index.js";
import { GeocoderDisabledError } from "../domain/errors/delivery-routing-errors.js";
import { DayComposer } from "./day-composer.js";
import type { DayStopsLocator } from "./day-stops-locator.js";
import { LocateDeliveryStopsCommand } from "./commands/locate-delivery-stops.command.js";
import { LocateDeliveryStopsHandler } from "./commands/locate-delivery-stops.handler.js";

const ORDER_LABEL = "delivery.locate-placed-order";
const DAY_LABEL = "delivery.locate-arrested-day";

/**
 * **Situer l'adresse dès la commande** (`documentation/livraisons/tournees/composition-automatique.md`,
 * Q4, lot CA0) — sans jamais retenir ni faire échouer celui qui déclenche.
 *
 * Deux déclencheurs, une seule mécanique : « Situer les arrêts » du JOUR
 * concerné (`LocateDeliveryStopsHandler`), qui n'envoie au géocodeur que ce
 * qui manque au carnet et au cache. C'est ce qui fait le rattrapage : une
 * adresse ratée (géocodeur en panne) est renvoyée par le passage suivant du
 * même jour — la commande suivante, l'arrêt du plan, le retirage, ou le geste
 * « Situer » de l'écran.
 *
 * - `orderPlaced` — appelé par le commerce sur `order.placed` ;
 * - `prepareDaySoon` — appelé par les abonnés de l'arrêt du plan et du
 *   retirage, qui tournent DANS une transaction ; à l'arrêt du plan
 *   (`prepareDaySoon`), il compose ensuite les tournées du jour
 *   (`DayAutoComposition`, 2026-10-07) ; au retirage (`locateDaySoon`), il
 *   ne fait que situer.
 *
 * Toujours APRÈS la validation (`AfterCommit`) et en fond (`BackgroundWork`) :
 * aucun appel réseau dans une transaction, aucune attente pour la passation.
 * Un échec est journalisé par `BackgroundWork`, jamais remonté.
 */
@Injectable()
export class DeliveryStopsLocating extends DeliveryOrderPlacedListener implements DayStopsLocator {
  private readonly logger = new Logger(DeliveryStopsLocating.name);

  constructor(
    private readonly orders: DeliveryOrdersReader,
    private readonly locate: LocateDeliveryStopsHandler,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
    private readonly composition: DayComposer,
  ) {
    super();
  }

  orderPlaced(orderId: string): void {
    this.afterCommit.defer(
      () => this.work.track(this.locateOrder(orderId), ORDER_LABEL),
      ORDER_LABEL,
    );
  }

  /**
   * Situer, PUIS composer (2026-10-07) : dans cet ordre, dans la même tâche —
   * composer d'abord laisserait à répartir tout ce qui n'est pas encore situé.
   */
  prepareDaySoon(day: string): void {
    this.afterCommit.defer(() => this.work.track(this.prepareDay(day), DAY_LABEL), DAY_LABEL);
  }

  locateDaySoon(day: string): void {
    this.afterCommit.defer(() => this.work.track(this.locateDay(day), DAY_LABEL), DAY_LABEL);
  }

  private async prepareDay(day: string): Promise<void> {
    await this.locateDay(day);
    await this.composition.composeDay(day);
  }

  /** Une livraison active, datée : son jour. Un retrait, une annulée, une sans jour : rien. */
  private async locateOrder(orderId: string): Promise<void> {
    const [order] = await this.orders.byIds([orderId]);
    if (order?.delivery !== true || order.status === "cancelled" || order.day === null) {
      return;
    }
    await this.locateDay(order.day);
  }

  /**
   * Sans géocodeur configuré, il n'y a rien à rattraper : le rapport de
   * démarrage le dit déjà, et les points ne viennent que du carnet. Le
   * journaliser à chaque commande ne dirait rien de plus.
   */
  private async locateDay(day: string): Promise<void> {
    try {
      await this.locate.execute(new LocateDeliveryStopsCommand(day));
    } catch (cause: unknown) {
      if (cause instanceof GeocoderDisabledError) {
        this.logger.debug(`Géocodeur éteint : les arrêts du ${day} restent au carnet.`);
        return;
      }
      throw cause;
    }
  }
}
