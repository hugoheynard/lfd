import type { ReservedVisibility } from "@lfd/contracts";

import type { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import type { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { CatalogItem } from "../../../domain/entities/catalog-item.js";
import type { CatalogItemRepository } from "../../../domain/ports/catalog-item.repository.js";
import {
  CatalogReservations,
  type CatalogReservation,
} from "../../../domain/ports/catalog-reservations.js";
import { MadeToOrderSettings } from "../../../domain/ports/made-to-order-settings.js";
import { ReservationCompanies } from "../../../domain/ports/reservation-companies.js";
import { build } from "./catalog-decision-doubles.js";

/** Un instant quelconque : aucune règle ne le compare à l'horloge, il n'est que recopié. */
export const NOW = new Date("2026-01-15T10:00:00.000Z");
export const COMPANY = "co_boulangerie";
export const COMPANY_NAME = "Le Fournil d'Anna";

/** Le réglage en mémoire, avec les défauts de la base ; note chaque écriture dans le fil. */
export class InMemoryMadeToOrderSettings extends MadeToOrderSettings {
  readonly madeToOrder = new Map<string, boolean>();
  readonly visibility = new Map<string, ReservedVisibility>();
  readonly at: Date[] = [];

  constructor(private readonly steps: string[]) {
    super();
  }

  setMadeToOrder(sku: string, madeToOrder: boolean, at: Date): Promise<boolean> {
    const changed = (this.madeToOrder.get(sku) ?? false) !== madeToOrder;
    this.madeToOrder.set(sku, madeToOrder);
    return this.wrote(`made-to-order:${sku}`, changed, at);
  }

  setReservedVisibility(sku: string, visibility: ReservedVisibility, at: Date): Promise<boolean> {
    const changed = (this.visibility.get(sku) ?? "hidden") !== visibility;
    this.visibility.set(sku, visibility);
    return this.wrote(`visibility:${sku}`, changed, at);
  }

  private wrote(step: string, changed: boolean, at: Date): Promise<boolean> {
    this.steps.push(step);
    this.at.push(at);
    return Promise.resolve(changed);
  }
}

/** Les réservations en mémoire, clé « sku|société » comme la clé primaire. */
export class InMemoryCatalogReservations extends CatalogReservations {
  readonly rows = new Map<string, CatalogReservation>();

  constructor(private readonly steps: string[]) {
    super();
  }

  reserve(reservation: CatalogReservation): Promise<boolean> {
    this.steps.push(`reserve:${reservation.sku}:${reservation.companyId}`);
    const key = `${reservation.sku}|${reservation.companyId}`;
    if (this.rows.has(key)) {
      return Promise.resolve(false);
    }
    this.rows.set(key, reservation);
    return Promise.resolve(true);
  }

  release(sku: string, companyId: string): Promise<boolean> {
    this.steps.push(`release:${sku}:${companyId}`);
    return Promise.resolve(this.rows.delete(`${sku}|${companyId}`));
  }
}

/** L'annuaire des sociétés : celles qu'on lui donne, et elles seules. */
export class KnownCompanies extends ReservationCompanies {
  constructor(private readonly names: ReadonlyMap<string, string>) {
    super();
  }

  nameOf(companyId: string): Promise<string | null> {
    return Promise.resolve(this.names.get(companyId) ?? null);
  }
}

/** Les doubles d'un handler du sur mesure, sur un même fil de gestes. */
export interface MadeToOrderDoubles {
  readonly steps: string[];
  readonly items: CatalogItemRepository;
  readonly events: RecordingPublisher;
  readonly uow: DirectUnitOfWork;
  readonly settings: InMemoryMadeToOrderSettings;
  readonly reservations: InMemoryCatalogReservations;
  readonly companies: KnownCompanies;
  readonly clock: FixedClock;
}

/** Les doubles du catalogue, plus ceux du sur mesure. */
export function buildMadeToOrder(seed?: (item: CatalogItem) => void): MadeToOrderDoubles {
  const { steps, items, events, uow } = build(seed);
  return {
    steps,
    items,
    events,
    uow,
    settings: new InMemoryMadeToOrderSettings(steps),
    reservations: new InMemoryCatalogReservations(steps),
    companies: new KnownCompanies(new Map([[COMPANY, COMPANY_NAME]])),
    clock: new FixedClock(NOW),
  };
}
