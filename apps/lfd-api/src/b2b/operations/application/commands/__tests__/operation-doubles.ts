import { Operation, type PrepareOperation } from "../../../domain/entities/operation.js";
import {
  OperationImageLibrary,
  type LibraryImage,
} from "../../../channels/media/operation-image-library.js";
import { OperationKeyTakenError } from "../../../domain/errors/operation-errors.js";
import { OperationRepository } from "../../../domain/ports/operation.repository.js";
import { OperationSkuCatalogue } from "../../../domain/ports/operation-sku.catalogue.js";
import { OperationWritingSwitch } from "../../../domain/ports/operation-writing-switch.js";

/**
 * Le dépôt en mémoire. Il garde des INSTANTANÉS et rend des agrégats neufs :
 * un handler qui muterait l'agrégat sans le rendre au port ne passerait pas
 * pour avoir écrit.
 */
export class InMemoryOperations extends OperationRepository {
  readonly rows = new Map<string, Operation>();
  adds = 0;
  saves = 0;

  constructor(seed: readonly Operation[] = []) {
    super();
    for (const operation of seed) {
      this.rows.set(operation.key, operation);
    }
  }

  load(key: string): Promise<Operation | null> {
    const found = this.rows.get(key);
    return Promise.resolve(found === undefined ? null : copyOf(found));
  }

  loadShowingImage(url: string): Promise<readonly Operation[]> {
    const showing = [...this.rows.values()].filter((operation) => {
      const snapshot = operation.snapshot();
      return snapshot.archivedAt === null && snapshot.image?.url === url;
    });
    return Promise.resolve(showing.map(copyOf));
  }

  add(operation: Operation): Promise<void> {
    if (this.rows.has(operation.key)) {
      return Promise.reject(new OperationKeyTakenError(operation.key));
    }
    this.adds += 1;
    this.rows.set(operation.key, copyOf(operation));
    return Promise.resolve();
  }

  save(operation: Operation): Promise<void> {
    this.saves += 1;
    this.rows.set(operation.key, copyOf(operation));
    return Promise.resolve();
  }

  /** L'état écrit — ou une erreur de test si rien ne l'a été. */
  stored(key: string) {
    const found = this.rows.get(key);
    if (found === undefined) {
      throw new RangeError(`aucune opération « ${key} » écrite`);
    }
    return found.snapshot();
  }
}

/** Le catalogue du commerce, réduit aux SKU qu'il connaît. */
export class KnownSkus extends OperationSkuCatalogue {
  constructor(private readonly known: readonly string[]) {
    super();
  }

  unknownAmong(skus: readonly string[]): Promise<readonly string[]> {
    return Promise.resolve(skus.filter((sku) => !this.known.includes(sku)));
  }
}

/** L'interrupteur, posé à la main. */
export class FixedWritingSwitch extends OperationWritingSwitch {
  constructor(private readonly open: boolean) {
    super();
  }

  isOpen(): boolean {
    return this.open;
  }
}

/** La médiathèque réduite aux images qu'elle connaît ; compte ses lectures. */
export class FixedImageLibrary extends OperationImageLibrary {
  reads = 0;

  constructor(private readonly images: readonly LibraryImage[] = []) {
    super();
  }

  describe(url: string): Promise<LibraryImage | null> {
    this.reads += 1;
    return Promise.resolve(this.images.find((image) => image.url === url) ?? null);
  }
}

/** Une image du fonds, avec son point focal. */
export function libraryImage(url: string, focal: LibraryImage["focal"] = null): LibraryImage {
  return { url, alt: "", width: 1200, height: 800, focal };
}

/** Relu par la même porte que la base : `reconstitute` sur l'instantané. */
function copyOf(operation: Operation): Operation {
  const snapshot = operation.snapshot();
  return Operation.reconstitute({
    key: snapshot.key,
    name: snapshot.name,
    lede: snapshot.lede,
    image: snapshot.image,
    schedule: {
      announceFrom: snapshot.schedule.announceFrom,
      orderFrom: snapshot.schedule.orderFrom,
      orderUntil: snapshot.schedule.orderUntil,
      pickupFrom: snapshot.schedule.pickupFrom.value,
      pickupUntil: snapshot.schedule.pickupUntil.value,
    },
    audience: snapshot.audience,
    skus: snapshot.skus,
    hidden: snapshot.hidden,
    archivedAt: snapshot.archivedAt,
    lastWrite: snapshot.lastWrite,
  });
}

/** Noël 2026. Les dates ne sont comparées qu'entre elles, jamais à l'horloge. */
export function noel(over: Partial<PrepareOperation> = {}): PrepareOperation {
  return {
    key: "noel-2026",
    name: { fr: "Noël 2026" },
    lede: null,
    image: null,
    schedule: {
      announceFrom: new Date("2026-10-31T23:00:00.000Z"),
      orderFrom: null,
      orderUntil: new Date("2026-12-21T11:00:00.000Z"),
      pickupFrom: "2026-12-20",
      pickupUntil: "2026-12-24",
    },
    audience: "both",
    ...over,
  };
}

/** Une opération déjà au commerce, préparée la veille par quelqu'un d'autre. */
export function preparedNoel(over: Partial<PrepareOperation> = {}): Operation {
  return Operation.prepare(noel(over), {
    by: "staff_veille",
    at: new Date("2026-10-01T09:00:00.000Z"),
  });
}
