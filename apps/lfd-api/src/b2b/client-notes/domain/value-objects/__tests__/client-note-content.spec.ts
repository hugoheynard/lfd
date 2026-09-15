import {
  CLIENT_NOTE_BODY_MAX as CONTRACT_BODY_MAX,
  CLIENT_NOTE_TITLE_MAX as CONTRACT_TITLE_MAX,
} from "@lfd/contracts";

import { InvalidClientNoteError } from "../../errors/client-notebook-errors.js";
import {
  CLIENT_NOTE_BODY_MAX,
  CLIENT_NOTE_TITLE_MAX,
  ClientNoteContent,
} from "../client-note-content.js";
import { clientNotePhotoKey, clientNoteThumbnailKey } from "../client-note-photo-key.js";
import { photoCardRevision } from "../../../../shared/photo-cards/domain/value-objects/photo-revision.js";

/**
 * **Le titre et la description d'une note, et les clés de sa photo.** En HTTP,
 * le schéma du contrat refuse les longueurs avant le value object ; ce test tient
 * les messages que seul un appel hors contrôleur verrait.
 */

describe("ClientNoteContent", () => {
  it("nettoie les espaces de bord ; la description est facultative", () => {
    expect(ClientNoteContent.create({ title: "  Visite ", body: " " })).toEqual({
      title: "Visite",
      body: "",
    });
  });

  it.each([
    [
      "un titre vide",
      { title: "  ", body: "" },
      "Note : le titre est vide. Donnez un titre à la note.",
    ],
    [
      "un titre trop long",
      { title: "t".repeat(81), body: "" },
      "Note : le titre fait 81 caractères, 80 au plus. " +
        "Raccourcissez-le et mettez le détail dans la description.",
    ],
    [
      "une description trop longue",
      { title: "Visite", body: "b".repeat(2001) },
      "Note : la description fait 2001 caractères, 2000 au plus. " +
        "Résumez-la : la photo garde la note entière.",
    ],
  ])("refuse %s (400)", (_case, input, message) => {
    expect(() => ClientNoteContent.create(input)).toThrow(InvalidClientNoteError);
    expect(() => ClientNoteContent.create(input)).toThrow(message);
  });

  it("accepte pile les bornes, et garde celles que l'écran énonce", () => {
    const content = ClientNoteContent.create({
      title: "t".repeat(CLIENT_NOTE_TITLE_MAX),
      body: "b".repeat(CLIENT_NOTE_BODY_MAX),
    });
    expect(content.title).toHaveLength(80);
    expect(CLIENT_NOTE_TITLE_MAX).toBe(CONTRACT_TITLE_MAX);
    expect(CLIENT_NOTE_BODY_MAX).toBe(CONTRACT_BODY_MAX);
  });
});

describe("les clés de la photo d'une note", () => {
  it("s'ancrent sur la société ; la vignette vit sous thumbs/ avec la même révision", () => {
    const photo = clientNotePhotoKey("c1", "01NOTE", "01REV");
    const thumbnail = clientNoteThumbnailKey(photo);

    expect(photo).toBe("companies/c1/client-notes/01NOTE-01REV");
    expect(thumbnail).toBe("companies/c1/client-notes/thumbs/01NOTE-01REV");
    expect(photoCardRevision(thumbnail)).toBe(photoCardRevision(photo));
  });
});
