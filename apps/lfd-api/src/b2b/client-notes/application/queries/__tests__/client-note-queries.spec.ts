import { Buffer } from "node:buffer";

import { pngOf } from "../../../../account/application/__tests__/delivery-procedure-doubles.js";
import {
  ClientNotebookCompanyNotFoundError,
  ClientNotePhotoNotFoundError,
  ClientNotePhotoUnreadableError,
} from "../../../domain/errors/client-notebook-errors.js";
import {
  COMPANY,
  InMemoryNotebooks,
  InMemoryStore,
  KnownCompanies,
  NotebookPhotoLocator,
  RecordingNotebookReader,
} from "../../__tests__/client-notes-doubles.js";
import { GetClientNotePhotoHandler } from "../get-client-note-photo.handler.js";
import { GetClientNotePhotoQuery } from "../get-client-note-photo.query.js";
import { GetClientNoteThumbnailHandler } from "../get-client-note-thumbnail.handler.js";
import { GetClientNoteThumbnailQuery } from "../get-client-note-thumbnail.query.js";
import { GetClientNotebookHandler } from "../get-client-notebook.handler.js";
import { GetClientNotebookQuery } from "../get-client-notebook.query.js";

/**
 * **Les lectures du carnet.** Un client inconnu est introuvable plutôt que servi
 * vide ; la photo et la vignette se servent par la même note, chacune sous sa
 * clé ; une note sans photo, ou d'un autre carnet, n'en a pas.
 */

const PHOTO_KEY = `companies/${COMPANY}/client-notes/n1-r1`;
const THUMBNAIL_KEY = `companies/${COMPANY}/client-notes/thumbs/n1-r1`;
const PHOTO = pngOf(2400, 1800);
const THUMBNAIL = pngOf(320, 240);

function scene() {
  const notebooks = new InMemoryNotebooks([]);
  notebooks.rows.set(COMPANY, {
    id: "nb1",
    companyId: COMPANY,
    notes: [
      {
        id: "n1",
        title: "Visite",
        body: "",
        photoKey: PHOTO_KEY,
        author: { staffUserId: "s", name: "" },
      },
      {
        id: "n2",
        title: "Tarifs",
        body: "",
        photoKey: null,
        author: { staffUserId: "s", name: "" },
      },
    ],
  });
  const store = new InMemoryStore([]);
  store.objects.set(PHOTO_KEY, { bytes: PHOTO, contentType: "image/png" });
  store.objects.set(THUMBNAIL_KEY, { bytes: THUMBNAIL, contentType: "image/png" });
  const locator = new NotebookPhotoLocator(notebooks);
  return {
    store,
    photo: new GetClientNotePhotoHandler(locator, store),
    thumbnail: new GetClientNoteThumbnailHandler(locator, store),
  };
}

describe("lire le carnet", () => {
  it("sert le carnet d'un client connu", async () => {
    const reader = new RecordingNotebookReader();
    const handler = new GetClientNotebookHandler(new KnownCompanies(), reader);
    await expect(handler.execute(new GetClientNotebookQuery(COMPANY))).resolves.toEqual({
      companyId: COMPANY,
      notes: [],
    });
  });

  it("dit qu'un client inconnu est introuvable, sans lire de carnet (404)", async () => {
    const reader = new RecordingNotebookReader();
    const handler = new GetClientNotebookHandler(new KnownCompanies([]), reader);
    await expect(handler.execute(new GetClientNotebookQuery("inconnu"))).rejects.toBeInstanceOf(
      ClientNotebookCompanyNotFoundError,
    );
    expect(reader.reads).toEqual([]);
  });
});

describe("servir la photo et la vignette", () => {
  it("sert chacune sous sa clé, avec le type relu aux octets", async () => {
    const current = scene();
    const photo = await current.photo.execute(new GetClientNotePhotoQuery(COMPANY, "n1"));
    const thumbnail = await current.thumbnail.execute(
      new GetClientNoteThumbnailQuery(COMPANY, "n1"),
    );

    expect(photo).toEqual({ contentType: "image/png", bytes: PHOTO });
    expect(thumbnail).toEqual({ contentType: "image/png", bytes: THUMBNAIL });
  });

  it("dit qu'une note sans photo, ou d'un autre carnet, n'en a pas (404)", async () => {
    const current = scene();
    await expect(
      current.thumbnail.execute(new GetClientNoteThumbnailQuery(COMPANY, "n2")),
    ).rejects.toBeInstanceOf(ClientNotePhotoNotFoundError);
    await expect(
      current.photo.execute(new GetClientNotePhotoQuery("autre-societe", "n1")),
    ).rejects.toBeInstanceOf(ClientNotePhotoNotFoundError);
  });

  it("lève une panne quand les octets rangés ne sont pas une image (500)", async () => {
    const current = scene();
    current.store.objects.set(THUMBNAIL_KEY, {
      bytes: Buffer.from("%PDF-1.4", "latin1"),
      contentType: "image/png",
    });
    await expect(
      current.thumbnail.execute(new GetClientNoteThumbnailQuery(COMPANY, "n1")),
    ).rejects.toBeInstanceOf(ClientNotePhotoUnreadableError);
  });
});
