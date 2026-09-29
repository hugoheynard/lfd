import { DeliveryBag } from "../../../domain/entities/delivery-bag.js";
import type { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import type { DepartedStop } from "../../../domain/entities/departure-sheet.js";
import { StopLoading, type StopLoadingSnapshot } from "../../../domain/entities/stop-loading.js";
import { BagCodeDrawer } from "../../../domain/ports/bag-code-drawer.js";
import { DeliveryBagRepository } from "../../../domain/ports/delivery-bag.repository.js";
import { DepartedStopRepository } from "../../../domain/ports/departed-stop.repository.js";
import { StopLoadingRepository } from "../../../domain/ports/stop-loading.repository.js";

/** Un tirage écrit d'avance, rejoué dans l'ordre ; épuisé, il répète le dernier. */
export class ScriptedDrawer extends BagCodeDrawer {
  private next = 0;

  constructor(private readonly codes: readonly string[]) {
    super();
  }

  draw(): string {
    const code = this.codes[Math.min(this.next, this.codes.length - 1)] ?? "000000";
    this.next += 1;
    return code;
  }
}

/** Des sacs en mémoire, stockés par leur instantané comme en base. */
export class InMemoryBags extends DeliveryBagRepository {
  readonly byId = new Map<string, DeliveryBag>();

  constructor(...bags: readonly DeliveryBag[]) {
    super();
    for (const bag of bags) {
      this.byId.set(bag.id, DeliveryBag.restore(bag.toSnapshot()));
    }
  }

  load(bagId: string): Promise<DeliveryBag | null> {
    const found = this.byId.get(bagId);
    return Promise.resolve(found === undefined ? null : DeliveryBag.restore(found.toSnapshot()));
  }

  findByCode(code: string): Promise<DeliveryBag | null> {
    const found = [...this.byId.values()].find((bag) => bag.code === code);
    return found === undefined ? Promise.resolve(null) : this.load(found.id);
  }

  codesTaken(codes: readonly string[]): Promise<ReadonlySet<string>> {
    const taken = new Set([...this.byId.values()].map((bag) => bag.code));
    return Promise.resolve(new Set(codes.filter((code) => taken.has(code))));
  }

  declare(bags: readonly DeliveryBag[]): Promise<void> {
    for (const bag of bags) {
      this.byId.set(bag.id, DeliveryBag.restore(bag.toSnapshot()));
    }
    return Promise.resolve();
  }

  save(bag: DeliveryBag): Promise<void> {
    this.byId.set(bag.id, DeliveryBag.restore(bag.toSnapshot()));
    return Promise.resolve();
  }
}

/** Les chargements des arrêts vivants, par commande. */
export class InMemoryStopLoadings extends StopLoadingRepository {
  readonly saves: string[] = [];
  private readonly byOrder = new Map<string, StopLoadingSnapshot>();

  constructor(...stops: readonly StopLoadingSnapshot[]) {
    super();
    for (const stop of stops) {
      this.byOrder.set(stop.orderId, stop);
    }
  }

  /** Aucun verrou en mémoire : `_lockBagId` n'a rien à sérialiser. */
  forOrder(orderId: string, _lockBagId?: string): Promise<StopLoading | null> {
    const found = this.byOrder.get(orderId);
    return Promise.resolve(found === undefined ? null : StopLoading.restore(found));
  }

  forRound(round: DeliveryRound): Promise<readonly StopLoading[]> {
    return Promise.resolve(
      round.liveStops.flatMap((stop) => {
        const found = this.byOrder.get(stop.orderId);
        return found?.stopId === stop.id ? [StopLoading.restore(found)] : [];
      }),
    );
  }

  save(loading: StopLoading): Promise<boolean> {
    const stored = this.byOrder.get(loading.orderId);
    if (stored !== undefined) {
      const changed = new Map(loading.changedLoads().map((load) => [load.bagId, load]));
      const kept = stored.loads.filter((load) => !changed.has(load.bagId));
      this.byOrder.set(loading.orderId, { ...stored, loads: [...kept, ...changed.values()] });
    }
    this.saves.push(loading.stopId);
    return Promise.resolve(true);
  }

  /** Le chargement tel qu'il est « en base ». */
  stored(orderId: string): StopLoadingSnapshot | undefined {
    return this.byOrder.get(orderId);
  }
}

/** Les feuilles figées au départ, gardées. */
export class RecordingDepartedStops extends DepartedStopRepository {
  readonly recorded: DepartedStop[] = [];

  record(stops: readonly DepartedStop[]): Promise<void> {
    this.recorded.push(...stops);
    return Promise.resolve();
  }
}

/** Le chargement vivant d'une commande dans la tournée `r_1`, deux sacs non chargés. */
export function stopOf(
  orderId: string,
  overrides: Partial<StopLoadingSnapshot> = {},
): StopLoadingSnapshot {
  return {
    stopId: `r_1_s1`,
    roundId: "r_1",
    orderId,
    serviceDay: "2030-03-12",
    vehicleName: "Kangoo blanc",
    passage: 1,
    departedAt: null,
    bags: [
      { id: "b_1", code: "AAAAAA", voided: false },
      { id: "b_2", code: "BBBBBB", voided: false },
    ],
    loads: [],
    ...overrides,
  };
}

/** Un sac en base. */
export function bagOf(id: string, orderId: string, code: string): DeliveryBag {
  return DeliveryBag.restore({ id, orderId, code, voidedAt: null, createdAt: new Date(0) });
}
