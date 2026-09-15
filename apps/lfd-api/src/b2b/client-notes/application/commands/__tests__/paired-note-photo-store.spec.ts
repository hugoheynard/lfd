import { DocumentStorageUnavailableError } from "../../../../../platform/shared/errors/storage-errors.js";
import { ClientNoteThumbnailMissingError } from "../../../domain/errors/client-notebook-errors.js";
import { InMemoryStore } from "../../__tests__/client-notes-doubles.js";
import { PairedNotePhotoStore } from "../paired-note-photo-store.js";

/**
 * **Le magasin apparié** : ce qui fait d'UNE clé du socle une paire photo +
 * vignette. Rangées ensemble, supprimées ensemble, et aucune moitié ne reste.
 */

const PHOTO_KEY = "companies/c1/client-notes/n1-r1";
const THUMBNAIL_KEY = "companies/c1/client-notes/thumbs/n1-r1";
const PHOTO = { bytes: Buffer.from("photo"), contentType: "image/jpeg" };
const THUMBNAIL = { bytes: Buffer.from("vignette"), contentType: "image/jpeg" };

describe("PairedNotePhotoStore", () => {
  it("range la photo sous sa clé, la vignette sous la clé dérivée, et rend la clé de la photo", async () => {
    const inner = new InMemoryStore([]);
    const store = new PairedNotePhotoStore(inner, THUMBNAIL);

    await expect(store.save(PHOTO_KEY, PHOTO)).resolves.toBe(PHOTO_KEY);
    expect(inner.objects.get(PHOTO_KEY)).toBe(PHOTO);
    expect(inner.objects.get(THUMBNAIL_KEY)).toBe(THUMBNAIL);
  });

  it("refuse de ranger une photo sans vignette : faute de câblage, jamais silencieuse", async () => {
    const inner = new InMemoryStore([]);
    await expect(
      new PairedNotePhotoStore(inner, null).save(PHOTO_KEY, PHOTO),
    ).rejects.toBeInstanceOf(ClientNoteThumbnailMissingError);
    expect(inner.keys()).toEqual([]);
  });

  it("tente la vignette même quand la photo ne part pas, puis remonte l'échec", async () => {
    const inner = new InMemoryStore([]);
    await new PairedNotePhotoStore(inner, THUMBNAIL).save(PHOTO_KEY, PHOTO);
    inner.failDeleteOn = (key) => key === PHOTO_KEY;

    await expect(new PairedNotePhotoStore(inner, null).delete(PHOTO_KEY)).rejects.toBeInstanceOf(
      DocumentStorageUnavailableError,
    );
    expect(inner.keys()).toEqual([PHOTO_KEY]);
  });

  it("relit par la clé qu'on lui donne, sans rien dériver", async () => {
    const inner = new InMemoryStore([]);
    await new PairedNotePhotoStore(inner, THUMBNAIL).save(PHOTO_KEY, PHOTO);
    const store = new PairedNotePhotoStore(inner, null);

    await expect(store.read(THUMBNAIL_KEY)).resolves.toBe(THUMBNAIL.bytes);
    await expect(store.readIfPresent("absente")).resolves.toBeNull();
  });
});
