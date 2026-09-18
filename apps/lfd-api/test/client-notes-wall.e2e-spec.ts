/**
 * E2E des **notes du commercial** — le mur, les permissions et le journal, sur
 * un vrai Postgres et un vrai MinIO.
 *
 * Ce que seul le vrai montage prouve : que la note d'une autre société est
 * introuvable par l'URL de celle-ci ; que la ressource `b2b_client_notes` ferme
 * la porte à `support`, `comptabilite` et `dev`, qui lisent pourtant la fiche
 * client, quand `commercial` et `admin` passent ; et que chaque geste laisse au
 * journal un fait nominatif SANS aucun contenu (plan D5, D6).
 *
 * Le parcours et ses refus : `client-notes.e2e-spec.ts`.
 */
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  addNote,
  asRole,
  FACT,
  notesOf,
  PHOTO,
  readNotebook,
  SECRET_TITLE,
  storedImages,
  THUMBNAIL,
  tokenIsSubject,
} from "./client-notes-scene.js";
import { bootstrapE2e, E2E_STAFF_ID, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

let ctx: E2eContext;
let companyId: string;
let otherCompanyId: string;
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
  otherCompanyId = (await createCompany(ctx.prisma, { raisonSociale: "Autre Maison SAS" })).id;
  notes = notesOf(companyId);
});

function admin(): request.Agent {
  return ctx.asSub(E2E_STAFF_SUB);
}

describe("le mur", () => {
  it("la note d'une autre société est introuvable par l'URL de celle-ci (404)", async () => {
    const foreign = await addNote(admin(), otherCompanyId, "Chez l'autre", [PHOTO, THUMBNAIL]);
    await addNote(admin(), companyId, "Chez nous", null);

    await admin().get(`${notes}/${foreign}/photo`).expect(404);
    await admin().get(`${notes}/${foreign}/thumbnail`).expect(404);
    await admin().patch(`${notes}/${foreign}`).field("title", "Intrus").expect(404);
    await admin().delete(`${notes}/${foreign}`).expect(404);
    await admin()
      .put(`${notes}/order`)
      .send({ noteIds: [foreign] })
      .expect(409);

    const ours = await readNotebook(admin(), companyId);
    expect(ours.notes.map((note) => note.title)).toEqual(["Chez nous"]);
    const theirs = await readNotebook(admin(), otherCompanyId);
    expect(theirs.notes.map((note) => note.title)).toEqual(["Chez l'autre"]);
    expect(await storedImages(otherCompanyId)).toHaveLength(2);
  });
});

describe("les permissions", () => {
  it.each(["support", "comptabilite", "dev"] as const)(
    "%s ne lit pas les notes, ni leurs images, et n'écrit pas (403)",
    async (role) => {
      const noteId = await addNote(admin(), companyId, "Visite", [PHOTO, THUMBNAIL]);
      const agent = await asRole(ctx, role);

      await agent.get(notes).expect(403);
      await agent.get(`${notes}/${noteId}/thumbnail`).expect(403);
      await agent.post(notes).field("title", "Intrus").expect(403);
    },
  );

  it.each(["commercial", "admin"] as const)("%s lit et écrit les notes", async (role) => {
    const agent = await asRole(ctx, role);
    const noteId = await addNote(agent, companyId, "Visite", null);

    expect((await readNotebook(agent, companyId)).notes.map((note) => note.id)).toEqual([noteId]);
    await agent.delete(`${notes}/${noteId}`).expect(204);
  });
});

describe("le journal", () => {
  it("chaque geste laisse un fait nominatif, sans titre, description ni clé de photo", async () => {
    const first = await addNote(admin(), companyId, SECRET_TITLE, [PHOTO, THUMBNAIL]);
    const second = await addNote(admin(), companyId, "Rappel", null);
    await admin().patch(`${notes}/${second}`).field("title", SECRET_TITLE).expect(204);
    await admin()
      .put(`${notes}/order`)
      .send({ noteIds: [first, second] })
      .expect(204);
    await admin().delete(`${notes}/${first}`).expect(204);

    await ctx.drain();
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: companyId, type: FACT },
      orderBy: { occurredAt: "asc" },
      select: { actorId: true, payload: true },
    });
    expect(journal.map((entry) => entry.payload)).toEqual([
      { companyId, noteId: first, action: "note_added" },
      { companyId, noteId: second, action: "note_added" },
      { companyId, noteId: second, action: "note_revised" },
      { companyId, action: "notes_reordered" },
      { companyId, noteId: first, action: "note_removed" },
    ]);
    // Nominatif par la FICHE, plus par le `sub` du jeton (plan de l'auteur, D1).
    expect(journal.every((entry) => entry.actorId === E2E_STAFF_ID)).toBe(true);

    const written = JSON.stringify(journal);
    expect(written).not.toContain("code portail");
    expect(written).not.toContain("brioches");
    expect(written).not.toContain("client-notes/");
  });
});
