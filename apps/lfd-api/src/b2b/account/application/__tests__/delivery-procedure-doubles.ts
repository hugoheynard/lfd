import { Buffer } from "node:buffer";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import type { JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { DocumentStorageUnavailableError } from "../../../../platform/shared/errors/storage-errors.js";
import { DocumentStore, type StoredDocument } from "../../../../platform/storage/document-store.js";
import { DeliveryAddressBook } from "../../domain/entities/delivery-address-book.js";
import {
  DeliveryProcedure,
  type DeliveryProcedureState,
} from "../../domain/entities/delivery-procedure.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { DeliveryProcedureLock } from "../../domain/ports/delivery-procedure.lock.js";
import { DeliveryProcedureRepository } from "../../domain/ports/delivery-procedure.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import type { CompanyRole } from "../../domain/value-objects/company-role.js";

/**
 * Les doubles des gestes sur une procédure de livraison, partagés par les
 * suites client, staff et lecture. Chacun hérite du port qu'il joue : un
 * double qui dériverait du port cesserait de compiler.
 *
 * Ils écrivent tous dans un même **journal de gestes** (`log`) : l'ordre
 * « ranger → écrire → supprimer l'ancienne » est le sujet de ces suites, et il
 * ne se lit qu'en un seul endroit.
 */

export const COMPANY = "c1";
export const ADDRESS = "a1";

/** Un PNG minimal, dimensions lisibles : ce que `DeliveryStepPhoto` accepte. */
export function pngOf(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  return Buffer.concat([signature, chunkOf("IHDR", header), chunkOf("IEND", Buffer.alloc(0))]);
}

function chunkOf(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
}

/** Le rôle de l'acteur, fixé par la suite. */
export function membership(role: CompanyRole | null): MembershipReader {
  return { roleOf: () => Promise.resolve(role) };
}

/**
 * Le carnet de la société : `live` au carnet, `archived` archivées. Les dates ne
 * sont comparées qu'entre elles (ordre d'ancienneté), jamais à l'horloge.
 */
export function addressBook(
  live: readonly string[],
  archived: readonly string[] = [],
): CompanyAddressRepository {
  const entry = (id: string, archivedAt: Date | null) => ({
    id,
    lines: {
      label: id,
      ligne1: "1 rue",
      ligne2: "",
      codePostal: "75001",
      ville: "Paris",
      pays: "France",
    },
    specs: {
      note: "",
      slots: { mode: "everyday" as const, slot: null },
      deliveryContact: null,
      gps: null,
      signatureRequired: null,
    },
    createdAt: new Date(0),
    archivedAt,
  });
  return new (class extends CompanyAddressRepository {
    saveBilling(): Promise<void> {
      return Promise.resolve();
    }
    loadDeliveryBook(companyId: string): Promise<DeliveryAddressBook> {
      return Promise.resolve(
        DeliveryAddressBook.reconstitute({
          companyId,
          entries: [
            ...live.map((id) => entry(id, null)),
            ...archived.map((id) => entry(id, new Date(1))),
          ],
          defaultId: live[0] ?? null,
        }),
      );
    }
    saveDeliveryBook(): Promise<void> {
      return Promise.resolve();
    }
  })();
}

/**
 * Le dépôt en mémoire. Il garde l'ÉTAT écrit et rehydrate à chaque chargement :
 * une mutation non sauvée ne se voit donc pas au chargement suivant.
 */
export class InMemoryProcedures extends DeliveryProcedureRepository {
  readonly rows = new Map<string, DeliveryProcedureState>();
  failSave = false;

  constructor(
    private readonly log: string[],
    private readonly sequence: string[] = [],
  ) {
    super();
  }

  loadForAddress(companyId: string, addressId: string): Promise<DeliveryProcedure | null> {
    this.sequence.push(`load:${companyId}/${addressId}`);
    const row = this.rows.get(`${companyId}/${addressId}`);
    return Promise.resolve(row === undefined ? null : DeliveryProcedure.reconstitute(row));
  }

  save(procedure: DeliveryProcedure): Promise<void> {
    if (this.failSave) {
      return Promise.reject(new DocumentStorageUnavailableError("base en panne (double)."));
    }
    const state = procedure.toPersistence();
    this.log.push("procedure:save");
    this.rows.set(`${state.companyId}/${state.addressId}`, state);
    return Promise.resolve();
  }

  /** L'état écrit de la procédure de l'adresse par défaut de la suite. */
  state(): DeliveryProcedureState | undefined {
    return this.rows.get(`${COMPANY}/${ADDRESS}`);
  }
}

/**
 * Verrou doublé : il ne sérialise rien, il NOTE qu'on l'a pris, dans la même
 * séquence que les chargements — c'est l'ordre « verrou, puis chargement » que
 * les suites vérifient. La sérialisation réelle se prouve en e2e, contre Postgres.
 */
export class RecordingLock extends DeliveryProcedureLock {
  constructor(private readonly sequence: string[]) {
    super();
  }

  acquire(companyId: string, addressId: string): Promise<void> {
    this.sequence.push(`lock:${companyId}/${addressId}`);
    return Promise.resolve();
  }
}

/** Stockage en mémoire, fidèle au port : `delete` d'une clé absente réussit. */
export class InMemoryStore extends DocumentStore {
  readonly objects = new Map<string, StoredDocument>();
  failDelete = false;

  constructor(private readonly log: string[]) {
    super();
  }

  save(key: string, document: StoredDocument): Promise<string> {
    this.log.push(`store:save:${key}`);
    this.objects.set(key, document);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    return found === undefined
      ? Promise.reject(new DocumentStorageUnavailableError(`« ${key} » est absent.`))
      : Promise.resolve(found.bytes);
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key)?.bytes ?? null);
  }

  delete(key: string): Promise<void> {
    if (this.failDelete) {
      return Promise.reject(new DocumentStorageUnavailableError("bucket en panne (double)."));
    }
    this.log.push(`store:delete:${key}`);
    this.objects.delete(key);
    return Promise.resolve();
  }
}

/** Une unité de travail qui dit si l'on est dedans — sans transaction réelle. */
export class TrackingUnitOfWork extends UnitOfWork {
  open = false;

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.open = true;
    try {
      return await work();
    } finally {
      this.open = false;
    }
  }
}

/** Publieur qui note, pour chaque fait tracé, s'il est parti dans la transaction. */
export class TransactionAwarePublisher extends RecordingPublisher {
  readonly insideTransaction: boolean[] = [];
  failTraced = false;

  constructor(private readonly uow: TrackingUnitOfWork) {
    super();
  }

  override publishTraced(event: JournaledEvent): Promise<void> {
    if (this.failTraced) {
      return Promise.reject(
        new DocumentStorageUnavailableError(
          "journal en panne (double) — seule la catégorie compte.",
        ),
      );
    }
    this.insideTransaction.push(this.uow.open);
    return super.publishTraced(event);
  }
}
