/**
 * E2E des **notes du commercial** sur un compte client — le parcours et ses
 * refus, sur un vrai Postgres et un vrai MinIO.
 *
 * Ce que seuls le vrai SQL et le vrai stockage prouvent : que la note neuve
 * arrive en tête et que l'écriture ciblée garde l'ordre sans unique en base ;
 * que la photo ET sa vignette sont rangées, servies, remplacées et supprimées
 * ENSEMBLE dans le bucket ; que le multipart à deux fichiers arrive jusqu'aux
 * handlers ; et que deux dépôts simultanés ne s'effacent pas.
 *
 * Le mur, les permissions et le journal : `client-notes-wall.e2e-spec.ts`.
 */
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  addNote,
  notesOf,
  OTHER_PHOTO,
  OTHER_THUMBNAIL,
  PHOTO,
  readNotebook,
  SECRET_BODY,
  SECRET_TITLE,
  storedImages,
  THUMBNAIL,
  tokenIsSubject,
} from "./client-notes-scene.js";
import { photoOf, refusalOf } from "./delivery-procedure-scene.js";
import { bootstrapE2e, E2E_STAFF_ID, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import { legacyAuthorOf } from "./legacy-author-columns.js";

let ctx: E2eContext;
let companyId: string;
let notes: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: AdminTokenVerifier, value: tokenIsSubject }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  companyId = (await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Marais SAS" })).id;
  notes = notesOf(companyId);
});

function admin(): request.Agent {
  return ctx.asSub(E2E_STAFF_SUB);
}

describe("le carnet, de bout en bout", () => {
  it("dépose une note avec photo et vignette, en tête, nominative, et sert les deux images", async () => {
    const first = await addNote(admin(), companyId, SECRET_TITLE, [PHOTO, THUMBNAIL]);
    const second = await addNote(admin(), companyId, "Rappel des tarifs", null);

    const view = await readNotebook(admin(), companyId);
    expect(view.notes.map((note) => [note.number, note.id])).toEqual([
      [1, second],
      [2, first],
    ]);
    expect(view.notes[1]).toMatchObject({
      title: SECRET_TITLE,
      body: SECRET_BODY,
      createdByName: "Opérateur E2E",
    });
    expect(view.notes[0]?.photoRevision).toBeNull();
    expect(Number.isNaN(Date.parse(view.notes[1]?.createdAt ?? ""))).toBe(false);
    // L'id de fiche dans la nouvelle colonne seule ; l'ancienne, que Prisma ne
    // connaît plus, n'est plus écrite (plan de l'auteur, étape 5B).
    await expect(
      ctx.prisma.clientNote.findUniqueOrThrow({
        where: { id: first },
        select: { createdByStaffId: true },
      }),
    ).resolves.toEqual({ createdByStaffId: E2E_STAFF_ID });
    expect(await legacyAuthorOf(ctx.prisma, "client_notes.created_by_sub", first)).toBeNull();

    const revision = view.notes[1]?.photoRevision ?? "";
    expect(revision).not.toBe("");
    expect(await storedImages(companyId)).toEqual([
      `companies/${companyId}/client-notes/${first}-${revision}`,
      `companies/${companyId}/client-notes/thumbs/${first}-${revision}`,
    ]);

    for (const [route, bytes] of [
      ["photo", PHOTO],
      ["thumbnail", THUMBNAIL],
    ] as const) {
      const served = await photoOf(admin(), `${notes}/${first}/${route}`);
      expect(served.headers["content-type"]).toBe("image/png");
      expect(served.headers["x-content-type-options"]).toBe("nosniff");
      expect(served.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
      expect(Buffer.compare(served.body as Buffer, bytes)).toBe(0);
    }
  });

  it("remplace la paire, puis la retire : les anciens objets quittent le stockage", async () => {
    const noteId = await addNote(admin(), companyId, "Visite", [PHOTO, THUMBNAIL]);
    const before = await storedImages(companyId);

    await admin()
      .patch(`${notes}/${noteId}`)
      .field("title", "Visite refaite")
      .attach("photo", OTHER_PHOTO, "note.png")
      .attach("thumbnail", OTHER_THUMBNAIL, "vignette.png")
      .expect(204);
    const replaced = await storedImages(companyId);
    expect(replaced).toHaveLength(2);
    expect(replaced.some((key) => before.includes(key))).toBe(false);
    const served = await photoOf(admin(), `${notes}/${noteId}/thumbnail`);
    expect(Buffer.compare(served.body as Buffer, OTHER_THUMBNAIL)).toBe(0);

    await admin()
      .patch(`${notes}/${noteId}`)
      .field("title", "Visite refaite")
      .field("removePhoto", "true")
      .expect(204);
    expect(await storedImages(companyId)).toEqual([]);
    await admin().get(`${notes}/${noteId}/photo`).expect(404);
    await admin().get(`${notes}/${noteId}/thumbnail`).expect(404);
    expect((await readNotebook(admin(), companyId)).notes[0]).toMatchObject({
      title: "Visite refaite",
      photoRevision: null,
    });
  });

  it("supprime définitivement : la ligne, la photo, la vignette", async () => {
    const noteId = await addNote(admin(), companyId, "Visite", [PHOTO, THUMBNAIL]);
    await admin().delete(`${notes}/${noteId}`).expect(204);

    expect((await readNotebook(admin(), companyId)).notes).toEqual([]);
    expect(await ctx.prisma.clientNote.count({ where: { id: noteId } })).toBe(0);
    expect(await storedImages(companyId)).toEqual([]);
    await admin().get(`${notes}/${noteId}/photo`).expect(404);
  });

  it("réordonne, et refuse un ordre périmé en disant de recharger (409)", async () => {
    const one = await addNote(admin(), companyId, "Un", null);
    const two = await addNote(admin(), companyId, "Deux", null);
    const three = await addNote(admin(), companyId, "Trois", null);

    await admin()
      .put(`${notes}/order`)
      .send({ noteIds: [one, three, two] })
      .expect(204);
    const view = await readNotebook(admin(), companyId);
    expect(view.notes.map((note) => [note.number, note.title])).toEqual([
      [1, "Un"],
      [2, "Trois"],
      [3, "Deux"],
    ]);

    const stale = await admin()
      .put(`${notes}/order`)
      .send({ noteIds: [one, two] })
      .expect(409);
    expect(refusalOf(stale)).toEqual({
      code: "client_notes.notebook.order_stale",
      message:
        "Le carnet a changé depuis son affichage (une note a été ajoutée ou supprimée). " +
        "Rechargez-le, puis réordonnez à nouveau.",
    });
  });
});

describe("les refus", () => {
  it("refuse une photo sans vignette, sans rien ranger (400)", async () => {
    const refused = await admin()
      .post(notes)
      .field("title", "Visite")
      .attach("photo", PHOTO, "note.png")
      .expect(400);
    expect(refusalOf(refused)).toEqual({
      code: "client_notes.note_photo.unpaired",
      message:
        "La photo d'une note s'envoie avec sa vignette : l'une ne va pas sans l'autre. " +
        "Déposez la photo depuis l'écran des notes, qui fabrique la vignette au même envoi.",
    });
    expect(await storedImages(companyId)).toEqual([]);
  });

  it("refuse une vignette trop lourde en la nommant (400)", async () => {
    const heavy = Buffer.concat([THUMBNAIL, Buffer.alloc(60 * 1024)]);
    const refused = await admin()
      .post(notes)
      .field("title", "Visite")
      .attach("photo", PHOTO, "note.png")
      .attach("thumbnail", heavy, "vignette.png")
      .expect(400);
    expect(refusalOf(refused)).toMatchObject({ code: "client_notes.note_thumbnail.invalid" });
    expect(await storedImages(companyId)).toEqual([]);
  });

  it("refuse la cinquante-et-unième note (409)", async () => {
    for (let index = 0; index < 50; index += 1) {
      await addNote(admin(), companyId, `Note ${index}`, null);
    }
    const full = await admin().post(notes).field("title", "De trop").expect(409);
    expect(refusalOf(full)).toEqual({
      code: "client_notes.notebook.full",
      message:
        "Le carnet de ce client compte déjà 50 notes, le maximum. " +
        "Supprimez une note devenue inutile avant d'en ajouter une.",
    });
    expect(await ctx.prisma.clientNote.count()).toBe(50);
  });

  it("dit qu'une note inconnue n'existe plus, et qu'un client inconnu est introuvable (404)", async () => {
    const ghost = await admin().delete(`${notes}/01JGHOSTNOTE00000000000000`).expect(404);
    expect(refusalOf(ghost)).toEqual({
      code: "client_notes.note.not_found",
      message: "Cette note n'existe plus dans le carnet de ce client. Rechargez le carnet.",
    });
    const unknown = notesOf("01JUNKNOWNCOMPANY000000000");
    await admin().get(unknown).expect(404);
    await admin().post(unknown).field("title", "x").expect(404);
    expect(await ctx.prisma.clientNotebook.count()).toBe(0);
  });
});

/**
 * Régression gardée par construction : l'enregistrement supprime les notes
 * absentes de l'agrégat chargé. Sans le verrou du carnet, deux ajouts simultanés
 * chargeraient chacun le carnet d'avant, et le second effacerait la note du premier.
 */
describe("deux écritures simultanées sur le même carnet", () => {
  it("gardent les trois notes, et un seul carnet", async () => {
    const ids = await Promise.all([
      addNote(admin(), companyId, "Un", [PHOTO, THUMBNAIL]),
      addNote(admin(), companyId, "Deux", null),
      addNote(admin(), companyId, "Trois", null),
    ]);
    const view = await readNotebook(admin(), companyId);
    expect(view.notes.map((note) => note.id).sort()).toEqual([...ids].sort());
    expect(view.notes.map((note) => note.number)).toEqual([1, 2, 3]);
    expect(await ctx.prisma.clientNotebook.count()).toBe(1);
  });
});
