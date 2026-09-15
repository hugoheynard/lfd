import { Buffer } from "node:buffer";

import {
  CLIENT_NOTE_PHOTO_MAX_BYTES as CONTRACT_PHOTO_MAX_BYTES,
  CLIENT_NOTE_THUMBNAIL_MAX_BYTES as CONTRACT_THUMBNAIL_MAX_BYTES,
} from "@lfd/contracts";

import {
  ClientNotePhotoIntentError,
  ClientNotePhotoPairError,
  InvalidClientNotePhotoError,
  InvalidClientNoteThumbnailError,
} from "../../errors/client-notebook-errors.js";
import { clientNotePhotoChange } from "../client-note-photo-change.js";
import {
  CLIENT_NOTE_PHOTO_MAX_BYTES,
  CLIENT_NOTE_THUMBNAIL_MAX_BYTES,
  ClientNotePhoto,
  clientNoteImageContentType,
} from "../client-note-photo.js";

/**
 * **La photo d'une note et sa vignette.** L'une ne va pas sans l'autre ; chacune
 * a sa borne, et le refus nomme laquelle des deux est en cause, en Ko.
 *
 * ⚠️ Les deux bornes sont celles du contrat, estimées : elles se mesurent sur de
 * vraies photos de notes (plan, D7 bis) — ce test ne fige que la parité.
 */

/** Un PNG minimal aux dimensions lisibles. */
function pngOf(width: number, height: number): Buffer {
  const header = Buffer.alloc(25);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.write("IHDR", 12, "latin1");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

/** Un PNG valide gonflé jusqu'à `bytes` octets. */
function paddedPng(bytes: number): Buffer {
  const header = pngOf(40, 30);
  return Buffer.concat([header, Buffer.alloc(bytes - header.length)]);
}

const PHOTO = pngOf(2400, 1800);
const THUMBNAIL = pngOf(320, 240);
const PDF = Buffer.from("%PDF-1.4", "latin1");

describe("ClientNotePhoto", () => {
  it("accepte une paire photo + vignette, et relit leurs types aux octets", () => {
    const pair = ClientNotePhoto.create(PHOTO, THUMBNAIL);
    expect(pair.photo.contentType).toBe("image/png");
    expect(pair.thumbnail.bytes).toBe(THUMBNAIL);
    expect(clientNoteImageContentType(PHOTO)).toBe("image/png");
    expect(clientNoteImageContentType(PDF)).toBeNull();
  });

  it.each([
    ["une photo sans vignette", PHOTO, null],
    ["une vignette sans photo", null, THUMBNAIL],
  ])("refuse %s (400)", (_case, photo, thumbnail) => {
    const refuse = (): ClientNotePhoto => ClientNotePhoto.create(photo, thumbnail);
    expect(refuse).toThrow(ClientNotePhotoPairError);
    expect(refuse).toThrow(
      "La photo d'une note s'envoie avec sa vignette : l'une ne va pas sans l'autre. " +
        "Déposez la photo depuis l'écran des notes, qui fabrique la vignette au même envoi.",
    );
  });

  it("n'exige rien d'une note sans photo, mais refuse une moitié de paire", () => {
    expect(ClientNotePhoto.optional(null, null)).toBeNull();
    expect(() => ClientNotePhoto.optional(null, THUMBNAIL)).toThrow(ClientNotePhotoPairError);
  });

  it("refuse une photo trop lourde, en Ko — à une décimale de Mo, 610 et 600 se confondraient", () => {
    const heavy = paddedPng(CLIENT_NOTE_PHOTO_MAX_BYTES + 10 * 1024);
    const refuse = (): ClientNotePhoto => ClientNotePhoto.create(heavy, THUMBNAIL);
    expect(refuse).toThrow(InvalidClientNotePhotoError);
    expect(refuse).toThrow(
      "Photo de la note : elle pèse 610 Ko, la limite est de 600 Ko. " +
        "Déposez-la depuis l'écran des notes, qui la réduit avant l'envoi.",
    );
  });

  it("refuse une vignette trop lourde en nommant la vignette", () => {
    const heavy = paddedPng(CLIENT_NOTE_THUMBNAIL_MAX_BYTES + 1);
    expect(() => ClientNotePhoto.create(PHOTO, heavy)).toThrow(InvalidClientNoteThumbnailError);
    expect(() => ClientNotePhoto.create(PHOTO, heavy)).toThrow(
      "Vignette de la note : elle pèse 61 Ko, la limite est de 60 Ko.",
    );
  });

  it("accepte chacune pile à sa borne", () => {
    const photo = paddedPng(CLIENT_NOTE_PHOTO_MAX_BYTES);
    const thumbnail = paddedPng(CLIENT_NOTE_THUMBNAIL_MAX_BYTES);
    expect(ClientNotePhoto.create(photo, thumbnail).photo.bytes).toBe(photo);
  });

  it("valide la photo AVANT la vignette : son refus est celui qui aide", () => {
    expect(() => ClientNotePhoto.create(PDF, PDF)).toThrow(InvalidClientNotePhotoError);
    expect(() => ClientNotePhoto.create(PHOTO, PDF)).toThrow(
      "Vignette de la note : un JPEG ou un PNG est attendu (ni HEIC, ni PDF).",
    );
  });

  it("refuse une image vide ou tronquée", () => {
    expect(() => ClientNotePhoto.create(Buffer.alloc(0), THUMBNAIL)).toThrow(
      "Photo de la note : le fichier est vide. Reprenez la photo.",
    );
    const truncated = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => ClientNotePhoto.create(PHOTO, truncated)).toThrow(
      /Vignette de la note : .*tronquée/,
    );
  });

  it("garde les bornes que l'écran énonce", () => {
    expect(CLIENT_NOTE_PHOTO_MAX_BYTES).toBe(CONTRACT_PHOTO_MAX_BYTES);
    expect(CLIENT_NOTE_THUMBNAIL_MAX_BYTES).toBe(CONTRACT_THUMBNAIL_MAX_BYTES);
  });
});

describe("clientNotePhotoChange", () => {
  it("garde sans fichier, retire sur demande, remplace par une paire", () => {
    expect(clientNotePhotoChange(false, null, null)).toEqual({ kind: "keep" });
    expect(clientNotePhotoChange(true, null, null)).toEqual({ kind: "remove" });
    const change = clientNotePhotoChange(false, PHOTO, THUMBNAIL);
    expect(change.kind).toBe("replace");
  });

  it.each([
    ["la photo", PHOTO, null],
    ["la vignette", null, THUMBNAIL],
    ["les deux", PHOTO, THUMBNAIL],
  ])("refuse « retirer » avec %s jointe(s)", (_case, photo, thumbnail) => {
    expect(() => clientNotePhotoChange(true, photo, thumbnail)).toThrow(ClientNotePhotoIntentError);
  });

  it("refuse un remplacement sans vignette", () => {
    expect(() => clientNotePhotoChange(false, PHOTO, null)).toThrow(ClientNotePhotoPairError);
  });
});
