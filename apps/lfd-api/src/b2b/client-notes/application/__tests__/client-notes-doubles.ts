import { DocumentStorageUnavailableError } from "../../../../platform/shared/errors/storage-errors.js";
import { DocumentStore, type StoredDocument } from "../../../../platform/storage/document-store.js";
import {
  StaffDirectory,
  type StaffIdentity,
} from "../../../account/domain/ports/staff-directory.js";
import { ClientNotebook, type ClientNotebookState } from "../../domain/entities/client-notebook.js";
import { ClientNotePhotoLocator } from "../../domain/ports/client-note-photo.locator.js";
import { ClientNotebookLock } from "../../domain/ports/client-notebook.lock.js";
import { ClientNotebookReader } from "../../domain/ports/client-notebook.reader.js";
import { ClientNotebookRepository } from "../../domain/ports/client-notebook.repository.js";
import { NotebookCompanies } from "../../domain/ports/notebook-companies.js";

/**
 * Les doubles du carnet de notes, partagés par les suites d'écriture et de
 * lecture. Chacun hérite du port qu'il joue : un double qui dériverait du port
 * cesserait de compiler.
 *
 * `TrackingUnitOfWork`, `TransactionAwarePublisher` et `pngOf` viennent des
 * doubles de la procédure de livraison, qui les partagent déjà : ils ne savent
 * rien des étapes.
 */

export const COMPANY = "c1";

/** Les sociétés connues de la suite. */
export class KnownCompanies extends NotebookCompanies {
  constructor(private readonly known: readonly string[] = [COMPANY]) {
    super();
  }

  exists(companyId: string): Promise<boolean> {
    return Promise.resolve(this.known.includes(companyId));
  }
}

/** L'annuaire staff : un nom pour les `sub` connus, `null` pour les autres. */
export class FixedStaffDirectory extends StaffDirectory {
  constructor(private readonly names: Readonly<Record<string, string>>) {
    super();
  }

  identify(reference: string): Promise<StaffIdentity | null> {
    const name = this.names[reference];
    return Promise.resolve(name === undefined ? null : { name, role: "commercial" });
  }
}

/**
 * Le dépôt en mémoire. Il garde l'ÉTAT écrit et rehydrate à chaque chargement :
 * une mutation non sauvée ne se voit pas au chargement suivant.
 */
export class InMemoryNotebooks extends ClientNotebookRepository {
  readonly rows = new Map<string, ClientNotebookState>();
  failSave = false;

  constructor(private readonly log: string[]) {
    super();
  }

  loadForCompany(companyId: string): Promise<ClientNotebook | null> {
    this.log.push(`load:${companyId}`);
    const row = this.rows.get(companyId);
    return Promise.resolve(row === undefined ? null : ClientNotebook.reconstitute(row));
  }

  save(notebook: ClientNotebook): Promise<void> {
    if (this.failSave) {
      return Promise.reject(new DocumentStorageUnavailableError("base en panne (double)."));
    }
    const state = notebook.toPersistence();
    this.log.push("notebook:save");
    this.rows.set(state.companyId, state);
    return Promise.resolve();
  }

  /** L'état écrit du carnet de la société de la suite. */
  state(): ClientNotebookState | undefined {
    return this.rows.get(COMPANY);
  }
}

/** Verrou doublé : il NOTE qu'on l'a pris, dans la même séquence que les chargements. */
export class RecordingNotebookLock extends ClientNotebookLock {
  constructor(private readonly log: string[]) {
    super();
  }

  acquire(companyId: string): Promise<void> {
    this.log.push(`lock:${companyId}`);
    return Promise.resolve();
  }
}

/** Stockage en mémoire, fidèle au port : `delete` d'une clé absente réussit. */
export class InMemoryStore extends DocumentStore {
  readonly objects = new Map<string, StoredDocument>();
  /** Les clés dont le rangement échoue — pour éprouver le rattrapage de la paire. */
  failSaveOn: (key: string) => boolean = () => false;
  /** Les clés dont la suppression échoue. */
  failDeleteOn: (key: string) => boolean = () => false;

  constructor(private readonly log: string[]) {
    super();
  }

  save(key: string, document: StoredDocument): Promise<string> {
    if (this.failSaveOn(key)) {
      return Promise.reject(new DocumentStorageUnavailableError("bucket en panne (double)."));
    }
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
    if (this.failDeleteOn(key)) {
      return Promise.reject(new DocumentStorageUnavailableError("bucket en panne (double)."));
    }
    this.log.push(`store:delete:${key}`);
    this.objects.delete(key);
    return Promise.resolve();
  }

  /** Les clés rangées, triées. */
  keys(): string[] {
    return [...this.objects.keys()].sort();
  }
}

/** Le localisateur : la clé de photo d'une note, sous le mur de la société. */
export class NotebookPhotoLocator extends ClientNotePhotoLocator {
  constructor(private readonly notebooks: InMemoryNotebooks) {
    super();
  }

  photoKeyOf(companyId: string, noteId: string): Promise<string | null> {
    const note = this.notebooks.rows.get(companyId)?.notes.find((entry) => entry.id === noteId);
    return Promise.resolve(note?.photoKey ?? null);
  }
}

/** Le lecteur : il note la société lue et rend un carnet vide. */
export class RecordingNotebookReader extends ClientNotebookReader {
  readonly reads: string[] = [];

  read(companyId: string): ReturnType<ClientNotebookReader["read"]> {
    this.reads.push(companyId);
    return Promise.resolve({ companyId, notes: [] });
  }
}
