import { DeliveryProductsReader, type DeliveryProduct } from "../../../channels/commerce/index.js";
import type { BinCapacityView, BinTypeView } from "@lfd/contracts";

import type { BinCapacity } from "../../../domain/entities/bin-capacity.js";
import { BinType, type BinTypeSpec } from "../../../domain/entities/bin-type.js";
import { BinCapacityRepository } from "../../../domain/ports/bin-capacity.repository.js";
import { BinCatalogReader } from "../../../domain/ports/bin-catalog.reader.js";
import { ActiveBinTypesReader } from "../../../domain/ports/composition-prerequisites.readers.js";
import { BinTypeRepository } from "../../../domain/ports/bin-type.repository.js";

export const CREATED = new Date(0);

/** Un bac Euronorm 60 × 40 × 22. */
export const SPEC: BinTypeSpec = {
  name: "Bac M",
  outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
  inner: { lengthCm: 56, widthCm: 36, heightCm: 20 },
  isotherm: false,
  maxStack: 6,
  divisible: true,
};

export function binType(id: string, name: string): BinType {
  return BinType.declare({ ...SPEC, name, id, at: CREATED });
}

/** Le catalogue en mémoire : l'agrégat y est stocké par son état, comme en base. */
export class InMemoryBinTypes extends BinTypeRepository {
  readonly saved: BinType[] = [];
  private readonly byId = new Map<string, BinType>();

  constructor(...types: readonly BinType[]) {
    super();
    for (const type of types) {
      this.byId.set(type.id, BinType.restore(type.toState()));
    }
  }

  load(id: string): Promise<BinType | null> {
    const found = this.byId.get(id);
    return Promise.resolve(found === undefined ? null : BinType.restore(found.toState()));
  }

  save(type: BinType): Promise<void> {
    this.saved.push(type);
    this.byId.set(type.id, BinType.restore(type.toState()));
    return Promise.resolve();
  }

  activeNameTaken(name: string, exceptId: string | null): Promise<boolean> {
    return Promise.resolve(
      [...this.byId.values()].some(
        (type) => type.inService && type.name === name && type.id !== exceptId,
      ),
    );
  }

  /** L'état SAUVÉ — comme en base. */
  all(): readonly BinType[] {
    return [...this.byId.values()];
  }
}

/** Le lecteur du socle (CA-D3) sur le catalogue en mémoire. */
export class ActiveBinTypesOver extends ActiveBinTypesReader {
  constructor(private readonly types: InMemoryBinTypes) {
    super();
  }

  activeIds(): Promise<readonly string[]> {
    return Promise.resolve(
      this.types
        .all()
        .filter((t) => t.inService)
        .map((t) => t.id),
    );
  }
}

/** La grille en mémoire, clé `type|sku`. */
export class InMemoryBinCapacities extends BinCapacityRepository {
  readonly cells = new Map<string, number>();
  readonly writes: string[] = [];

  unitsOf(binTypeId: string, sku: string): Promise<number | null> {
    return Promise.resolve(this.cells.get(`${binTypeId}|${sku}`) ?? null);
  }

  save(capacity: BinCapacity): Promise<void> {
    this.writes.push(`save ${capacity.binTypeId}|${capacity.sku}`);
    this.cells.set(`${capacity.binTypeId}|${capacity.sku}`, capacity.units);
    return Promise.resolve();
  }

  remove(binTypeId: string, sku: string): Promise<void> {
    this.writes.push(`remove ${binTypeId}|${sku}`);
    this.cells.delete(`${binTypeId}|${sku}`);
    return Promise.resolve();
  }
}

/** Une lecture figée du catalogue des bacs. */
export class FixedBinCatalog extends BinCatalogReader {
  constructor(
    private readonly types: readonly BinTypeView[],
    private readonly capacities: readonly BinCapacityView[],
  ) {
    super();
  }

  listTypes(): Promise<readonly BinTypeView[]> {
    return Promise.resolve(this.types);
  }

  activeCapacities(): Promise<readonly BinCapacityView[]> {
    return Promise.resolve(this.capacities);
  }
}

/** Le catalogue B2B vendu, figé. */
export class FixedDeliveryProducts extends DeliveryProductsReader {
  constructor(private readonly products: readonly DeliveryProduct[]) {
    super();
  }

  sold(): Promise<readonly DeliveryProduct[]> {
    return Promise.resolve(this.products);
  }
}
