import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { DocumentStorageUnavailableError } from "../../../../../platform/shared/errors/storage-errors.js";
import {
  TrackingUnitOfWork,
  TransactionAwarePublisher,
  pngOf,
} from "../../../../account/application/__tests__/delivery-procedure-doubles.js";
import {
  ClientNotebookCompanyNotFoundError,
  ClientNotebookOrderStaleError,
  ClientNoteNotFoundError,
  ClientNotePhotoPairError,
} from "../../../domain/errors/client-notebook-errors.js";
import {
  COMPANY,
  FixedStaffDirectory,
  InMemoryNotebooks,
  InMemoryStore,
  KnownCompanies,
  RecordingNotebookLock,
} from "../../__tests__/client-notes-doubles.js";
import { AddClientNoteCommand } from "../add-client-note.command.js";
import { AddClientNoteHandler } from "../add-client-note.handler.js";
import { RemoveClientNoteCommand } from "../remove-client-note.command.js";
import { RemoveClientNoteHandler } from "../remove-client-note.handler.js";
import { ReorderClientNotesCommand } from "../reorder-client-notes.command.js";
import { ReorderClientNotesHandler } from "../reorder-client-notes.handler.js";
import { ReviseClientNoteCommand } from "../revise-client-note.command.js";
import { ReviseClientNoteHandler } from "../revise-client-note.handler.js";

/**
 * **Les gestes d'un agent sur le carnet de notes d'un client.**
 *
 * Ce qu'on tient ici : la note neuve en tête avec son auteur figé, la paire photo
 * + vignette rangée et supprimée ensemble, un fait par geste qui part DANS la
 * transaction et ne porte aucun contenu, et la société vérifiée avant tout dépôt.
 */

const MAYA = "staff-maya";
const FIELDS = { title: "Visite", body: "Commande de brioches" };
const PHOTO = pngOf(2400, 1800);
const THUMBNAIL = pngOf(320, 240);

function scene(companies = new KnownCompanies()) {
  const log: string[] = [];
  const notebooks = new InMemoryNotebooks(log);
  const store = new InMemoryStore(log);
  const uow = new TrackingUnitOfWork();
  const events = new TransactionAwarePublisher(uow);
  const deps = [
    companies,
    notebooks,
    new RecordingNotebookLock(log),
    store,
    new FixedIdGenerator(),
    uow,
    events,
  ] as const;
  return {
    log,
    notebooks,
    store,
    events,
    add: new AddClientNoteHandler(...deps, new FixedStaffDirectory({ [MAYA]: "Maya Commerciale" })),
    revise: new ReviseClientNoteHandler(...deps),
    remove: new RemoveClientNoteHandler(...deps),
    reorder: new ReorderClientNotesHandler(...deps),
  };
}

type Scene = ReturnType<typeof scene>;

function addNote(
  current: Scene,
  photo: Buffer | null = null,
  thumbnail: Buffer | null = null,
  staffUserId = MAYA,
): Promise<string> {
  return current.add.execute(
    new AddClientNoteCommand(COMPANY, FIELDS, photo, thumbnail, staffUserId),
  );
}

function revision(
  noteId: string,
  removePhoto: boolean,
  photo: Buffer | null,
  thumbnail: Buffer | null,
) {
  return new ReviseClientNoteCommand(COMPANY, noteId, FIELDS, removePhoto, photo, thumbnail);
}

describe("ajouter une note", () => {
  it("la range en tête, avec l'auteur figé de l'annuaire", async () => {
    const current = scene();
    const first = await addNote(current);
    const second = await addNote(current, null, null, "staff-inconnu");

    expect(current.notebooks.state()?.notes.map((note) => [note.id, note.author])).toEqual([
      [second, { staffUserId: "staff-inconnu", name: "" }],
      [first, { staffUserId: MAYA, name: "Maya Commerciale" }],
    ]);
  });

  it("range la photo ET sa vignette sous la même révision, avant d'écrire le carnet", async () => {
    const current = scene();
    const noteId = await addNote(current, PHOTO, THUMBNAIL);
    const photoKey = current.notebooks.state()?.notes[0]?.photoKey ?? "";
    const revision = photoKey.slice(photoKey.lastIndexOf("-") + 1);

    expect(photoKey).toBe(`companies/${COMPANY}/client-notes/${noteId}-${revision}`);
    expect(current.store.keys()).toEqual([
      photoKey,
      `companies/${COMPANY}/client-notes/thumbs/${noteId}-${revision}`,
    ]);
    expect(current.log.indexOf("notebook:save")).toBeGreaterThan(
      current.log.indexOf(`store:save:${photoKey}`),
    );
    expect(current.log.indexOf(`lock:${COMPANY}`)).toBeLessThan(
      current.log.indexOf(`load:${COMPANY}`),
    );
  });

  it("refuse une photo sans vignette sans rien ranger ni tracer", async () => {
    const current = scene();
    await expect(addNote(current, PHOTO, null)).rejects.toBeInstanceOf(ClientNotePhotoPairError);
    expect(current.store.keys()).toEqual([]);
    expect(current.events.traced).toEqual([]);
  });

  it("refuse un client inconnu AVANT de ranger quoi que ce soit (404)", async () => {
    const current = scene(new KnownCompanies([]));
    await expect(addNote(current, PHOTO, THUMBNAIL)).rejects.toBeInstanceOf(
      ClientNotebookCompanyNotFoundError,
    );
    expect(current.store.keys()).toEqual([]);
  });

  it("retire la photo quand sa vignette ne se range pas : aucune moitié de paire ne reste", async () => {
    const current = scene();
    current.store.failSaveOn = (key) => key.includes("/thumbs/");
    await expect(addNote(current, PHOTO, THUMBNAIL)).rejects.toBeInstanceOf(
      DocumentStorageUnavailableError,
    );
    expect(current.store.keys()).toEqual([]);
    expect(current.notebooks.state()).toBeUndefined();
  });

  it("retire la paire neuve quand le journal refuse le fait — le geste n'a pas eu lieu", async () => {
    const current = scene();
    current.events.failTraced = true;
    await expect(addNote(current, PHOTO, THUMBNAIL)).rejects.toBeInstanceOf(
      DocumentStorageUnavailableError,
    );
    expect(current.store.keys()).toEqual([]);
  });
});

describe("refaire, supprimer, réordonner", () => {
  it("remplace la paire : l'ancienne photo et l'ancienne vignette quittent le stockage", async () => {
    const current = scene();
    const noteId = await addNote(current, PHOTO, THUMBNAIL);
    const before = current.store.keys();

    await current.revise.execute(revision(noteId, false, THUMBNAIL, THUMBNAIL));
    const after = current.store.keys();
    expect(after).toHaveLength(2);
    expect(after.some((key) => before.includes(key))).toBe(false);

    await current.revise.execute(revision(noteId, true, null, null));
    expect(current.store.keys()).toEqual([]);
    expect(current.notebooks.state()?.notes[0]?.photoKey).toBeNull();
  });

  it("réussit quand l'ancienne vignette ne part pas du stockage : l'orphelin se journalise", async () => {
    const current = scene();
    const noteId = await addNote(current, PHOTO, THUMBNAIL);
    current.store.failDeleteOn = (key) => key.includes("/thumbs/");

    await current.revise.execute(revision(noteId, true, null, null));
    expect(current.notebooks.state()?.notes[0]?.photoKey).toBeNull();
    // La photo lisible est partie malgré l'échec de la vignette : les deux sont tentées.
    expect(current.store.keys().filter((key) => !key.includes("/thumbs/"))).toEqual([]);
  });

  it("supprime définitivement la note, sa photo et sa vignette", async () => {
    const current = scene();
    const noteId = await addNote(current, PHOTO, THUMBNAIL);
    await current.remove.execute(new RemoveClientNoteCommand(COMPANY, noteId));

    expect(current.notebooks.state()?.notes).toEqual([]);
    expect(current.store.keys()).toEqual([]);
  });

  it("dit qu'une note inconnue n'existe plus, et retire la paire déjà rangée pour elle", async () => {
    const current = scene();
    await addNote(current);
    await expect(
      current.revise.execute(revision("fantome", false, PHOTO, THUMBNAIL)),
    ).rejects.toBeInstanceOf(ClientNoteNotFoundError);
    expect(current.store.keys()).toEqual([]);
  });

  it("refuse un ordre périmé, et sur un carnet qui n'existe pas encore", async () => {
    const empty = scene();
    await expect(
      empty.reorder.execute(new ReorderClientNotesCommand(COMPANY, ["n1"])),
    ).rejects.toBeInstanceOf(ClientNotebookOrderStaleError);

    const current = scene();
    const noteId = await addNote(current);
    await addNote(current);
    await expect(
      current.reorder.execute(new ReorderClientNotesCommand(COMPANY, [noteId])),
    ).rejects.toBeInstanceOf(ClientNotebookOrderStaleError);
  });
});

describe("le journal", () => {
  it("chaque geste inscrit son fait DANS la transaction, sans aucun contenu", async () => {
    const current = scene();
    const first = await addNote(current, PHOTO, THUMBNAIL);
    const second = await addNote(current);
    await current.revise.execute(revision(first, false, null, null));
    await current.reorder.execute(new ReorderClientNotesCommand(COMPANY, [first, second]));
    await current.remove.execute(new RemoveClientNoteCommand(COMPANY, first));

    const facts = current.events.traced.map((event) => event.journalFact());
    expect(facts.map((fact) => fact.payload)).toEqual([
      { companyId: COMPANY, noteId: first, action: "note_added" },
      { companyId: COMPANY, noteId: second, action: "note_added" },
      { companyId: COMPANY, noteId: first, action: "note_revised" },
      { companyId: COMPANY, action: "notes_reordered" },
      { companyId: COMPANY, noteId: first, action: "note_removed" },
    ]);
    expect(new Set(facts.map((fact) => fact.type))).toEqual(
      new Set(["company.client_note_edited_by_staff"]),
    );
    expect(current.events.insideTransaction).toEqual([true, true, true, true, true]);
  });

  it("n'inscrit rien quand l'écriture échoue", async () => {
    const current = scene();
    current.notebooks.failSave = true;
    await expect(addNote(current)).rejects.toBeInstanceOf(DocumentStorageUnavailableError);
    expect(current.events.traced).toEqual([]);
  });
});
