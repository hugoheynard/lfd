import type { StaffEntryShortcut, StaffOrderSupply } from "@lfd/contracts";
import { instantToLocal } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import {
  sameDayDoorOf,
  sameDayOpenTo,
  type SameDayDoor,
} from "../../../order-cutoffs/domain/same-day-doors.js";
import { DayShelfStock } from "../../../resupply/application/day-shelf-stock.js";
import { ShelfStockLock } from "../../../resupply/domain/shelf-stock-lock.js";
import type { Order } from "../../domain/entities/order.js";
import { SameDayOrderClosedError } from "../../domain/errors/same-day-order-closed.error.js";
import { NoPickupLeftTodayError } from "../../domain/errors/shelf-circuit-errors.js";
import { SameDayOrderReader } from "../../domain/ports/same-day-order.reader.js";
import { SiteDaySettingsReader } from "../../domain/ports/site-day-settings.reader.js";
import { staffSupplyOf } from "../../domain/services/order-supply-rules.js";
import {
  ensureShelfRevisionCovered,
  ensureShelfStockCovers,
  pickupLeftToday,
  shelfClaimOf,
  type ShelfClaim,
} from "../../domain/services/shelf-circuit.js";
import {
  PLANNED_SUPPLY,
  type OrderSupplyDecision,
} from "../../domain/value-objects/order-supply.js";
import { OrderPlanGate } from "./order-plan-gate.service.js";
import type { OrderParties } from "./order-parties.js";

/**
 * **Le circuit du jour J à la passation** (plan
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`,
 * §11.2, §12, lot L4) : décider d'où vient la marchandise, puis garder ce qui
 * limite une commande prise sur la vitrine — sa clientèle, les créneaux
 * restants de son point, et le reste en vitrine sous le verrou du stock.
 *
 * 🔴 **Le verrou du stock et celui de la journée ne sont jamais tenus
 * ensemble** (`ShelfStockLock`, §11.2) : une commande `shelf` ne passe pas
 * par `OrderPlanGate.hold`, une commande `planned` ne passe pas par
 * {@link hold}. `OrderDrafting.holdSupply` choisit l'un OU l'autre.
 */
@Injectable()
export class ShelfCircuit {
  constructor(
    private readonly plans: OrderPlanGate,
    private readonly sameDay: SameDayOrderReader,
    private readonly sites: SiteDaySettingsReader,
    private readonly lock: ShelfStockLock,
    private readonly stock: DayShelfStock,
    private readonly clock: Clock,
  ) {}

  /**
   * **Le serveur décide la marque** (§11.1, Hugo 2026-11-02) :
   *
   * - l'équipe : ce que l'écran envoie (`planned` par défaut — le raccourci
   *   « Retrait immédiat » envoie `shelf` et `immediate_pickup`, lot L6 ;
   *   un raccourci sans `shelf` est refusé, {@link staffSupplyOf}) ;
   * - un client : `shelf` pour AUJOURD'HUI sur un plan ARRÊTÉ — aujourd'hui
   *   ne se fabrique plus pour lui. Plan ouvert (pas encore arrêté, ou
   *   rouvert) : `planned`, le fournil la prend.
   *
   * La marque `shelf` porte « aujourd'hui » : l'agrégat refuse une autre
   * journée (`ensureSupplyFits`).
   *
   * @throws {EntryShortcutOffShelfError} l'équipe envoie un raccourci sans `shelf`.
   */
  async decide(
    parties: OrderParties,
    day: string | null,
    requested: StaffOrderSupply | undefined,
    shortcut?: StaffEntryShortcut,
  ): Promise<OrderSupplyDecision> {
    const today = this.plans.today();
    if (parties.placedByStaffId !== null) {
      return staffSupplyOf(requested, shortcut, today);
    }
    if (day !== today || !(await this.plans.isClosed(today))) {
      return PLANNED_SUPPLY;
    }
    return shelfOn(today);
  }

  /**
   * Les gardes du circuit, à la place de l'arrêt du plan et de l'heure
   * limite (§11.1) : la porte est ouverte par le réglage, et le point sert
   * encore aujourd'hui (§12 bloquant 3). Sans verrou : un refus tôt.
   *
   * @throws {SameDayOrderClosedError} le réglage ne l'ouvre pas à cette clientèle.
   * @throws {NoPickupLeftTodayError} le point n'a plus de créneau aujourd'hui pour elle.
   */
  async ensureOpen(parties: OrderParties, siteId: string | null): Promise<void> {
    const refusal = await this.refusalFor(doorOf(parties), siteId);
    if (refusal !== null) {
      throw refusal;
    }
  }

  /**
   * Le refus des gardes du circuit pour cette porte, sans le lever — `null`
   * quand elle est ouverte. Partagé par la passation ({@link ensureOpen}) et
   * par la révision d'une commande sur stock, qui en fait aussi un verdict
   * d'écran (lot L5).
   */
  async refusalFor(
    door: SameDayDoor,
    siteId: string | null,
  ): Promise<SameDayOrderClosedError | NoPickupLeftTodayError | null> {
    const today = this.plans.today();
    if (!sameDayOpenTo(await this.sameDay.settings(), door)) {
      return new SameDayOrderClosedError(today);
    }
    if (door === "counter") {
      return null;
    }
    const site =
      siteId === null ? null : ((await this.sites.forDay(today, [siteId])).get(siteId) ?? null);
    if (!pickupLeftToday(door, site, instantToLocal(this.clock.now()).time)) {
      return new NoPickupLeftTodayError(site?.label ?? null);
    }
    return null;
  }

  /**
   * **La vitrine tenue pour la commande qu'on écrit** — à appeler en PREMIER
   * dans la transaction qui la persiste, avant le bon de fidélité et la
   * ligne `orders` (§12, sérieux : l'ordre dans `persist`). Prend le verrou
   * du stock de son point, relit le reste, et refuse ce qu'il ne couvre pas :
   * de deux passations sur le dernier article, la seconde attend la première
   * et voit son prélèvement.
   *
   * @returns `false` pour une commande fabriquée : rien n'est tenu ici.
   * @throws {ShelfStockShortError} le reste ne couvre pas une ligne.
   * @throws {NoPickupLeftTodayError} la commande n'a pas de site à décompter.
   */
  async hold(order: Order): Promise<boolean> {
    const claim = shelfClaimOf(order.toPersistence());
    if (claim === null) {
      return false;
    }
    if (claim.siteId === null) {
      // Un point sans site ne porte aucun stock : jamais un reste inventé.
      throw new NoPickupLeftTodayError(null);
    }
    await this.lock.lock(claim.serviceDay, claim.siteId);
    ensureShelfStockCovers(claim.lines, await this.stock.at(claim.siteId, claim.serviceDay));
    return true;
  }

  /**
   * **La vitrine tenue pour une révision** (plan du jour J, §13, lot L5) : le
   * même verrou que la passation, pris APRÈS celui de la ligne `orders` —
   * jamais avec celui de la journée. Le reste relu compte encore `before` ;
   * seules les hausses de `after` y sont jugées ({@link ensureShelfRevisionCovered}).
   *
   * @throws {ShelfStockShortError} une hausse dépasse ce qui reste.
   * @throws {NoPickupLeftTodayError} la commande n'a pas de site à décompter.
   */
  async holdRevision(before: ShelfClaim, after: ShelfClaim): Promise<void> {
    if (before.siteId === null) {
      throw new NoPickupLeftTodayError(null);
    }
    await this.lock.lock(before.serviceDay, before.siteId);
    ensureShelfRevisionCovered(
      before.lines,
      after.lines,
      await this.stock.at(before.siteId, before.serviceDay),
    );
  }

  /**
   * Le sort d'un pro sans crédit au comptoir (Q7) : `true` quand le réglage
   * le refuse, `false` quand il l'envoie au lien de paiement.
   */
  async refusesWithoutCredit(): Promise<boolean> {
    return (await this.sameDay.settings()).sameDayProWithoutCredit === "refuse";
  }
}

function shelfOn(today: string): OrderSupplyDecision {
  return { supply: "shelf", today, entryShortcut: null };
}

function doorOf(parties: OrderParties): SameDayDoor {
  return sameDayDoorOf(parties.companyId, parties.placedByStaffId !== null);
}
