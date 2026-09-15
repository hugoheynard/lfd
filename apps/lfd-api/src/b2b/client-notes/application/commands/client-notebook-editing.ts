import type { ClientNoteFields } from "@lfd/contracts";
import { Logger } from "@nestjs/common";

import type { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { DocumentStore, StoredDocument } from "../../../../platform/storage/document-store.js";
import {
  addPhotoCard,
  removePhotoCard,
  reorderPhotoCards,
  revisePhotoCard,
} from "../../../shared/photo-cards/application/photo-card-editing.js";
import type {
  InTransaction,
  InTransactionForNewCard,
  OrphanPhotoReason,
  PhotoCardGestures,
  PhotoCardPorts,
  PhotoCardUsage,
} from "../../../shared/photo-cards/application/photo-card-usage.js";
import type { PhotoChange } from "../../../shared/photo-cards/domain/value-objects/photo-change.js";
import { ClientNotebook, type ClientNoteAuthor } from "../../domain/entities/client-notebook.js";
import {
  ClientNoteAuthorMissingError,
  ClientNotebookOrderStaleError,
  ClientNoteNotFoundError,
} from "../../domain/errors/client-notebook-errors.js";
import type { ClientNotebookLock } from "../../domain/ports/client-notebook.lock.js";
import type { ClientNotebookRepository } from "../../domain/ports/client-notebook.repository.js";
import type { NotebookCompanies } from "../../domain/ports/notebook-companies.js";
import { ClientNoteContent } from "../../domain/value-objects/client-note-content.js";
import { clientNotePhotoChange } from "../../domain/value-objects/client-note-photo-change.js";
import { clientNotePhotoKey } from "../../domain/value-objects/client-note-photo-key.js";
import { ClientNotePhoto } from "../../domain/value-objects/client-note-photo.js";
import { ensureNotebookCompany } from "../services/notebook-company-guard.js";
import { PairedNotePhotoStore } from "./paired-note-photo-store.js";

/**
 * **Les gestes sur le carnet de notes d'un client, sans mur d'accès** : la
 * surface staff et sa permission `b2b_client_notes` l'ont posé avant.
 *
 * La séquence (vérifier → ranger → verrou/sauver → nettoyer) et son ordre sont
 * ceux du socle des cartes à photo (`shared/photo-cards/application/`), que la
 * procédure de livraison partage. Ce fichier ne garde que ce qui est au carnet :
 * valider une NOTE et sa paire photo + vignette, la société comme cible, la clé
 * du verrou et du stockage, l'auteur, et les mots des refus et du journal.
 *
 * La validation reste AVANT l'appel au socle : un contenu refusé ne coûte ni
 * lecture ni dépôt.
 */

/** Les ports dont les gestes ont besoin. */
export interface NotebookEditingPorts {
  readonly companies: NotebookCompanies;
  readonly notebooks: ClientNotebookRepository;
  readonly lock: ClientNotebookLock;
  readonly store: DocumentStore;
  readonly ids: IdGenerator;
  readonly uow: UnitOfWork;
}

/** Une note neuve telle que la commande la porte. */
export interface NewNote {
  readonly fields: ClientNoteFields;
  readonly photo: Buffer | null;
  readonly thumbnail: Buffer | null;
  readonly author: ClientNoteAuthor;
}

/** Une révision de note telle que la commande la porte. */
export interface NoteRevision {
  readonly fields: ClientNoteFields;
  readonly removePhoto: boolean;
  readonly photo: Buffer | null;
  readonly thumbnail: Buffer | null;
}

const logger = new Logger("ClientNotebookEditing");

const ORPHAN_WHY: Readonly<Record<OrphanPhotoReason, string>> = {
  replaced_or_removed: "photo remplacée ou retirée",
  card_removed: "note supprimée",
  write_failed: "écriture du carnet en échec",
};

/** Ajoute une note en tête du carnet, avec sa paire photo + vignette s'il y en a une ; rend son id. */
export async function addClientNote(
  ports: NotebookEditingPorts,
  companyId: string,
  note: NewNote,
  inTransaction: InTransactionForNewCard,
): Promise<string> {
  const content = ClientNoteContent.create(note.fields);
  const pair = ClientNotePhoto.optional(note.photo, note.thumbnail);
  return addPhotoCard(
    socleOf(ports, pair?.thumbnail ?? null),
    usageOf(ports, addingBy(note.author)),
    companyId,
    { content, photo: pair?.photo ?? null },
    inTransaction,
  );
}

/** Refait une note : titre, description, et photo gardée, retirée ou remplacée. */
export async function reviseClientNote(
  ports: NotebookEditingPorts,
  companyId: string,
  noteId: string,
  revision: NoteRevision,
  inTransaction: InTransaction,
): Promise<void> {
  const content = ClientNoteContent.create(revision.fields);
  const change = clientNotePhotoChange(revision.removePhoto, revision.photo, revision.thumbnail);
  const thumbnail = change.kind === "replace" ? change.photo.thumbnail : null;
  await revisePhotoCard(
    socleOf(ports, thumbnail),
    usageOf(ports, NOT_ADDING),
    companyId,
    noteId,
    { content, change: readablePhotoOf(change) },
    inTransaction,
  );
}

/** Supprime définitivement une note, puis sa photo et sa vignette du stockage. */
export async function removeClientNote(
  ports: NotebookEditingPorts,
  companyId: string,
  noteId: string,
  inTransaction: InTransaction,
): Promise<void> {
  await removePhotoCard(
    socleOf(ports, null),
    usageOf(ports, NOT_ADDING),
    companyId,
    noteId,
    inTransaction,
  );
}

/** Range les notes dans l'ordre donné — toutes, chacune une fois. */
export async function reorderClientNotes(
  ports: NotebookEditingPorts,
  companyId: string,
  noteIds: readonly string[],
  inTransaction: InTransaction,
): Promise<void> {
  await reorderPhotoCards(
    socleOf(ports, null),
    usageOf(ports, NOT_ADDING),
    companyId,
    noteIds,
    inTransaction,
  );
}

/** Les ports du socle : le stockage y devient celui des paires photo + vignette. */
function socleOf(ports: NotebookEditingPorts, thumbnail: StoredDocument | null): PhotoCardPorts {
  return {
    store: new PairedNotePhotoStore(ports.store, thumbnail),
    ids: ports.ids,
    uow: ports.uow,
  };
}

/** Le socle range la photo lisible ; la vignette voyage dans le magasin apparié. */
function readablePhotoOf(change: PhotoChange<ClientNotePhoto>): PhotoChange<StoredDocument> {
  return change.kind === "replace" ? { kind: "replace", photo: change.photo.photo } : change;
}

type AddGesture = PhotoCardGestures<ClientNotebook, ClientNoteContent>["add"];

/** L'ajout d'une note, avec l'auteur figé du geste. */
function addingBy(author: ClientNoteAuthor): AddGesture {
  return (notebook, noteId, content, photoKey) =>
    notebook.addNote(noteId, content, photoKey, author);
}

/**
 * Les gestes qui n'ajoutent pas : ils n'ont pas d'auteur à figer, et le socle
 * n'appelle jamais `add` sur leur chemin. S'il le faisait, on refuserait
 * d'écrire une note sans auteur plutôt que d'en inventer un.
 */
const NOT_ADDING: AddGesture = () => {
  throw new ClientNoteAuthorMissingError();
};

/** Ce que le carnet branche sur le socle. Le verrou est pris avant le chargement : le socle tient cet ordre. */
function usageOf(
  ports: NotebookEditingPorts,
  add: AddGesture,
): PhotoCardUsage<string, ClientNotebook, ClientNoteContent> {
  return {
    identity: {
      ensure: (companyId) => ensureNotebookCompany(ports.companies, companyId),
      lock: (companyId) => ports.lock.acquire(companyId),
      photoKey: (companyId, noteId, revision) => clientNotePhotoKey(companyId, noteId, revision),
    },
    aggregates: {
      load: (companyId) => ports.notebooks.loadForCompany(companyId),
      open: (companyId, id) => ClientNotebook.openFor({ id, companyId }),
      save: (notebook) => ports.notebooks.save(notebook),
    },
    gestures: {
      add,
      revise: (notebook, noteId, content) => notebook.reviseNote(noteId, content),
      attachPhoto: (notebook, noteId, photoKey) => notebook.attachPhoto(noteId, photoKey),
      detachPhoto: (notebook, noteId) => notebook.detachPhoto(noteId),
      remove: (notebook, noteId) => notebook.removeNote(noteId),
      reorder: (notebook, noteIds) => notebook.reorder(noteIds),
    },
    missing: {
      cardNotFound: (noteId) => new ClientNoteNotFoundError(noteId),
      orderStale: () => new ClientNotebookOrderStaleError(),
    },
    orphans: {
      remained: (reason, key, trace) =>
        logger.error(`Photo de note restée au stockage (${ORPHAN_WHY[reason]}) : ${key}`, trace),
    },
  };
}
