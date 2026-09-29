/**
 * E2E des **sections requises** et de la **révision attendue** d'un document
 * légal (plan `documentation/legal/plan-page-confidentialite.md` §4.2, §4.5) —
 * sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : la clé `section` survit à l'aller-retour
 * JSONB et à la route publique ; l'écriture est conditionnée EN BASE à la
 * révision lue ; une ligne illisible refuse l'écriture au lieu de la réécrire
 * vide.
 */
import type {
  LegalDocumentParagraphCreated,
  LegalDocumentView,
  LegalMention,
} from "@lfd/contracts";

import { CommandBus } from "@nestjs/cqrs";

import { seedLegalDocuments } from "../src/dev/seeding/legal-documents.seed.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { legalDocumentWrites, prose } from "./legal-document-writes.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.prisma.platformContent.deleteMany();
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);
const { revisionOf, withRevision, addParagraph } = legalDocumentWrites(staff);

const publicView = async (mention: LegalMention): Promise<LegalDocumentView> =>
  jsonBody<LegalDocumentView>(await ctx.http().get(`/content/legal/${mention}`).expect(200));

/** Crée la section de suppression des données de `privacy` et rend son identifiant. */
async function createDataDeletion(): Promise<string> {
  return jsonBody<LegalDocumentParagraphCreated>(
    await staff()
      .post("/admin/content/legal/privacy/sections")
      .send(await withRevision({ ...prose("suppression"), section: "dataDeletion" }, "privacy"))
      .expect(201),
  ).id;
}

describe("la section requise de la politique de confidentialité", () => {
  it("se crée avec le texte saisi, et la route publique rend sa clé", async () => {
    await addParagraph("finalités", "privacy");
    const id = await createDataDeletion();

    const served = (await publicView("privacy")).content.paragraphs;
    expect(served.map((paragraph) => paragraph.section)).toEqual([undefined, "dataDeletion"]);
    expect(served[1]).toMatchObject({ id, fr: { title: "Article suppression" } });
  });

  it("ne se supprime pas — 409, et elle reste servie", async () => {
    const id = await createDataDeletion();

    const refused = await staff()
      .delete(
        `/admin/content/legal/privacy/paragraphs/${id}?expectedRevision=${await revisionOf("privacy")}`,
      )
      .expect(409);
    expect(JSON.stringify(refused.body)).toContain("modifiez son texte");
    expect((await publicView("privacy")).content.paragraphs.map((p) => p.id)).toEqual([id]);
  });

  /** Régression (§4.5, B1) : la première correction du texte effaçait la clé. */
  it("garde sa clé quand on corrige son texte, et reste insupprimable", async () => {
    const id = await createDataDeletion();
    await staff()
      .put(`/admin/content/legal/privacy/paragraphs/${id}`)
      .send(await withRevision(prose("suppression-v2"), "privacy"))
      .expect(204);

    expect((await publicView("privacy")).content.paragraphs[0]).toMatchObject({
      section: "dataDeletion",
      fr: { title: "Article suppression-v2" },
    });
    await staff()
      .delete(
        `/admin/content/legal/privacy/paragraphs/${id}?expectedRevision=${await revisionOf("privacy")}`,
      )
      .expect(409);
  });

  it("refuse une seconde section de même clé (409)", async () => {
    await createDataDeletion();
    await staff()
      .post("/admin/content/legal/privacy/sections")
      .send(await withRevision({ ...prose("bis"), section: "dataDeletion" }, "privacy"))
      .expect(409);
  });

  it("refuse une section que la mention n'exige pas (400)", async () => {
    await staff()
      .post("/admin/content/legal/cookies/sections")
      .send(await withRevision({ ...prose("x"), section: "dataDeletion" }, "cookies"))
      .expect(400);
    expect(await ctx.prisma.platformContent.count()).toBe(0);
  });

  it("ne se pose pas par la route d'ajout ordinaire : la clé y est ignorée (S2)", async () => {
    await staff()
      .post("/admin/content/legal/privacy/paragraphs")
      .send(await withRevision({ ...prose("x"), section: "dataDeletion" }, "privacy"))
      .expect(201);

    expect((await publicView("privacy")).content.paragraphs[0]?.section).toBeUndefined();
  });
});

describe("la révision attendue (§4.5, B2)", () => {
  /**
   * Régression : `saveLegalDocument` réécrivait le JSON entier sans condition —
   * un onglet ouvert avant la création de la section la réécrivait sans elle.
   */
  it("refuse en 409 une écriture sur une révision périmée, et n'écrit rien", async () => {
    const stale = await revisionOf("privacy");
    await createDataDeletion();

    const refused = await staff()
      .post("/admin/content/legal/privacy/paragraphs")
      .send({ ...prose("tardif"), expectedRevision: stale })
      .expect(409);
    expect(JSON.stringify(refused.body)).toContain("rechargez-le");
    expect((await publicView("privacy")).content.paragraphs).toHaveLength(1);
  });

  it("refuse en 409 la création d'un document que quelqu'un vient de créer", async () => {
    await addParagraph("premier", "salesTerms");

    await staff()
      .put("/admin/content/legal/salesTerms/title")
      .send({ fr: "a", en: "b", it: "c", expectedRevision: 0 })
      .expect(409);
  });

  it("refuse en 400 une création de section qui n'annonce pas sa révision", async () => {
    await staff()
      .post("/admin/content/legal/privacy/sections")
      .send({ ...prose("x"), section: "dataDeletion" })
      .expect(400);
  });

  /**
   * Transition (2026-09-29) : le back-office en ligne n'envoie pas encore la
   * révision. Absente, l'écriture passe comme avant. À retirer au resserrement.
   */
  it("écrit sans contrôle une écriture existante qui n'annonce pas sa révision", async () => {
    const id = jsonBody<LegalDocumentParagraphCreated>(
      await staff().post("/admin/content/legal/privacy/paragraphs").send(prose("x")).expect(201),
    ).id;
    await staff().put(`/admin/content/legal/privacy/paragraphs/${id}`).send(prose("y")).expect(204);
    await staff().delete(`/admin/content/legal/privacy/paragraphs/${id}`).expect(204);
    expect(await revisionOf("privacy")).toBe(3);
  });
});

describe("un contenu illisible en base (§4.5, B3)", () => {
  it("se lit sur le repli en public, mais refuse l'écriture sans rien toucher", async () => {
    const broken = { title: { fr: "Confidentialité" }, paragraphs: "pas une liste" };
    await ctx.prisma.platformContent.create({
      data: { key: "privacy", content: broken, revision: 4, updatedBy: "quelqu'un" },
    });

    expect((await publicView("privacy")).content.paragraphs).toEqual([]);
    await staff()
      .post("/admin/content/legal/privacy/paragraphs")
      .send({ ...prose("x"), expectedRevision: 4 })
      .expect(500);

    const row = await ctx.prisma.platformContent.findUnique({ where: { key: "privacy" } });
    expect(row?.content).toEqual(broken);
    expect(row?.revision).toBe(4);
  });
});

describe("le semis de développement (§4.5, S4)", () => {
  it("crée la section de privacy par la commande, une seule fois", async () => {
    const seed = { prisma: ctx.prisma, commands: ctx.app.get(CommandBus) };
    await seedLegalDocuments(seed);
    await seedLegalDocuments(seed);

    const sections = (await publicView("privacy")).content.paragraphs.filter(
      (paragraph) => paragraph.section === "dataDeletion",
    );
    expect(sections).toHaveLength(1);
    expect((await publicView("cookies")).content.paragraphs.some((p) => p.section)).toBe(false);
  });
});
