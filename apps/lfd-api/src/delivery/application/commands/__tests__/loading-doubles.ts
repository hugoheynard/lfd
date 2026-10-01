import { DepartureHoldsReader } from "../../../channels/handover/index.js";
import { BinType } from "../../../domain/entities/bin-type.js";
import { DeliveryBin, type DeliveryBinState } from "../../../domain/entities/delivery-bin.js";
import type { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import type { DepartedStop } from "../../../domain/entities/departure-sheet.js";
import { StopLoading, type StopLoadingSnapshot } from "../../../domain/entities/stop-loading.js";
import { BinCodeDrawer } from "../../../domain/ports/bin-code-drawer.js";
import { BinTypeLookup } from "../../../domain/ports/bin-type-lookup.js";
import { DeliveryBinRepository } from "../../../domain/ports/delivery-bin.repository.js";
import { DepartedStopRepository } from "../../../domain/ports/departed-stop.repository.js";
import { StopLoadingRepository } from "../../../domain/ports/stop-loading.repository.js";

/** Un tirage écrit d'avance, rejoué dans l'ordre ; épuisé, il répète le dernier. */
export class ScriptedDrawer extends BinCodeDrawer {
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

/** Des bacs en mémoire, stockés par leur instantané comme en base. */
export class InMemoryBins extends DeliveryBinRepository {
  readonly byId = new Map<string, DeliveryBin>();

  constructor(...bins: readonly DeliveryBin[]) {
    super();
    for (const bin of bins) {
      this.byId.set(bin.id, DeliveryBin.restore(bin.toSnapshot()));
    }
  }

  load(binId: string): Promise<DeliveryBin | null> {
    const found = this.byId.get(binId);
    return Promise.resolve(found === undefined ? null : DeliveryBin.restore(found.toSnapshot()));
  }

  findByCode(code: string): Promise<DeliveryBin | null> {
    const found = [...this.byId.values()].find((bin) => bin.code === code);
    return found === undefined ? Promise.resolve(null) : this.load(found.id);
  }

  codesTaken(codes: readonly string[]): Promise<ReadonlySet<string>> {
    const taken = new Set([...this.byId.values()].map((bin) => bin.code));
    return Promise.resolve(new Set(codes.filter((code) => taken.has(code))));
  }

  liveHalvesOf(physicalBinId: string): Promise<readonly DeliveryBin[]> {
    return Promise.resolve(
      [...this.byId.values()]
        .filter((bin) => bin.physicalBinId === physicalBinId && bin.voidedAt === null)
        .map((bin) => DeliveryBin.restore(bin.toSnapshot())),
    );
  }

  declare(bins: readonly DeliveryBin[]): Promise<void> {
    for (const bin of bins) {
      this.byId.set(bin.id, DeliveryBin.restore(bin.toSnapshot()));
    }
    return Promise.resolve();
  }

  save(bin: DeliveryBin): Promise<void> {
    this.byId.set(bin.id, DeliveryBin.restore(bin.toSnapshot()));
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

  /** Aucun verrou en mémoire : `_lockBinId` n'a rien à sérialiser. */
  forOrder(orderId: string, _lockBinId?: string): Promise<StopLoading | null> {
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
      const changed = new Map(loading.changedLoads().map((load) => [load.binId, load]));
      const kept = stored.loads.filter((load) => !changed.has(load.binId));
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

/** Le chargement vivant d'une commande dans la tournée `r_1`, deux bacs non chargés. */
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
    roundOrderIds: [orderId],
    bins: [
      { id: "b_1", code: "AAAAAA", voided: false, partnerOrderId: null },
      { id: "b_2", code: "BBBBBB", voided: false, partnerOrderId: null },
    ],
    loads: [],
    ...overrides,
  };
}

/** Un bac entier en base, du type `t_m` ; `overrides` en fait une moitié, un annulé… */
export function binOf(
  id: string,
  orderId: string,
  code: string,
  overrides: Partial<DeliveryBinState> = {},
): DeliveryBin {
  return DeliveryBin.restore({
    id,
    orderId,
    code,
    binTypeId: "t_m",
    half: null,
    physicalBinId: null,
    innerBags: 0,
    voidedAt: null,
    createdAt: new Date(0),
    ...overrides,
  });
}

/** Le catalogue des types, vu de la déclaration : des types donnés d'avance. */
export class FixedBinTypeLookup extends BinTypeLookup {
  private readonly byId: ReadonlyMap<string, BinType>;

  constructor(...types: readonly BinType[]) {
    super();
    this.byId = new Map(types.map((binType) => [binType.id, binType]));
  }

  load(id: string): Promise<BinType | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }
}

/** Un type de bac du catalogue : cloisonnable par défaut, en service. */
export function binTypeOf(
  id: string,
  options: { readonly divisible?: boolean; readonly archived?: boolean } = {},
): BinType {
  const binType = BinType.declare({
    id,
    name: `Bac ${id}`,
    outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
    inner: { lengthCm: 57, widthCm: 37, heightCm: 20 },
    isotherm: false,
    maxStack: 5,
    divisible: options.divisible ?? true,
    at: new Date(0),
  });
  if (options.archived === true) {
    binType.archive(new Date(0));
  }
  return binType;
}

/** Le retrait, tel que le départ l'interroge : une liste de retenues fixée d'avance. */
export class FixedDepartureHolds extends DepartureHoldsReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly held: readonly string[] = []) {
    super();
  }

  heldOrders(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    this.asked.push(orderIds);
    return Promise.resolve(new Set(orderIds.filter((id) => this.held.includes(id))));
  }
}
