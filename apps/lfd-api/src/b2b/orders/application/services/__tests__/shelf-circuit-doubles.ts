import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { DayShelfStock } from "../../../../resupply/application/day-shelf-stock.js";
import {
  FixedShelfDraws,
  RecordingShelfStockLock,
} from "../../../../resupply/application/__tests__/shelf-stock-doubles.js";
import type { EstimatedStockLine } from "../../../../resupply/domain/estimated-stock.js";
import type { ResupplyReceiptSnapshot } from "../../../../resupply/domain/resupply-receipt.js";
import { ResupplyReceiptReader } from "../../../../resupply/domain/resupply-receipt.reader.js";
import type { ShelfStockLock } from "../../../../resupply/domain/shelf-stock-lock.js";
import type { SameDayOrderReader } from "../../../domain/ports/same-day-order.reader.js";
import {
  type SiteDaySettings,
  SiteDaySettingsReader,
} from "../../../domain/ports/site-day-settings.reader.js";
import { FixedSameDay, GATE_NOW } from "../../commands/__tests__/plan-doubles.js";
import type { OrderPlanGate } from "../order-plan-gate.service.js";
import { ShelfCircuit } from "../shelf-circuit.service.js";

/**
 * Doubles du circuit du jour J (lot L4), écrits à la main en héritant des
 * ports — jamais `jest.fn()`.
 */

/** Aucun reçu : le reste de `FixedShelfStock` ne passe pas par eux. */
class NoReceipts extends ResupplyReceiptReader {
  on(): Promise<readonly ResupplyReceiptSnapshot[]> {
    return Promise.resolve([]);
  }
}

/** Le reste de la vitrine, posé par « jour:point », et la trace des lectures. */
export class FixedShelfStock extends DayShelfStock {
  readonly lines = new Map<string, readonly EstimatedStockLine[]>();
  readonly read: string[] = [];

  constructor() {
    super(new NoReceipts(), new FixedShelfDraws());
  }

  set(serviceDay: string, siteId: string, lines: readonly EstimatedStockLine[]): this {
    this.lines.set(`${serviceDay}:${siteId}`, lines);
    return this;
  }

  override at(siteId: string, serviceDay: string): Promise<readonly EstimatedStockLine[]> {
    this.read.push(`${serviceDay}:${siteId}`);
    return Promise.resolve(this.lines.get(`${serviceDay}:${siteId}`) ?? []);
  }
}

/** Un site d'aujourd'hui, sans créneau ni fenêtre — à compléter par le test. */
export function siteDay(overrides: Partial<SiteDaySettings> = {}): SiteDaySettings {
  return {
    label: "Village",
    supply: "on_site",
    transferMode: "integrated",
    counterSetupMinutes: 0,
    gps: null,
    proPickup: null,
    publicRules: [],
    publicClosures: [],
    ...overrides,
  };
}

/** Les réglages des sites par identifiant, quel que soit le jour. */
export class FixedSiteDays extends SiteDaySettingsReader {
  constructor(private readonly sites: ReadonlyMap<string, SiteDaySettings> = new Map()) {
    super();
  }

  forDay(_day: string, siteIds: readonly string[]): Promise<ReadonlyMap<string, SiteDaySettings>> {
    return Promise.resolve(
      new Map(
        siteIds.flatMap((id) => {
          const site = this.sites.get(id);
          return site === undefined ? [] : [[id, site] as const];
        }),
      ),
    );
  }
}

export interface ShelfCircuitDoubles {
  readonly sameDay?: SameDayOrderReader;
  readonly sites?: SiteDaySettingsReader;
  readonly lock?: ShelfStockLock;
  readonly stock?: DayShelfStock;
  readonly now?: Date;
}

/**
 * Le circuit monté sur ces doubles, sur la porte du plan du test : son
 * « aujourd'hui » est celui de la porte. Par défaut, le jour même est fermé
 * à toutes les portes, aucun site ne sert, aucun stock — le circuit ne
 * s'ouvre que si le test l'ouvre.
 */
export function shelfCircuitOf(
  plans: OrderPlanGate,
  doubles: ShelfCircuitDoubles = {},
): ShelfCircuit {
  return new ShelfCircuit(
    plans,
    doubles.sameDay ?? new FixedSameDay(false),
    doubles.sites ?? new FixedSiteDays(),
    doubles.lock ?? new RecordingShelfStockLock(),
    doubles.stock ?? new FixedShelfStock(),
    new FixedClock(doubles.now ?? GATE_NOW),
  );
}
