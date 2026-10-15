/**
 * E2E des **CGV par audience** (plan `documentation/legal/plan-cgv-par-audience.md`,
 * lots 0 à 2) — sur un vrai Postgres et le vrai stockage objet de test.
 *
 * Ce que seul ce niveau prouve :
 *
 * 1. le droit : les mentions sont sous `lfc_legal`, le pied de page reste sous
 *    `b2b_settings` — deux contrôleurs, deux gardes, vérifiées par la vraie
 *    résolution des rôles ;
 * 2. les CGV pro sont publiques, et jamais rédigées elles rendent « en cours
 *    de rédaction » (leur titre, aucun article), jamais une 404 ni les CGV
 *    particuliers ;
 * 3. le PDF : un non-PDF refusé, un dépôt servi en `attachment` daté, un
 *    second qui remplace le premier sans l'écraser, et la lecture publique
 *    qui annonce le PDF en vigueur (`pdf`, `null` sans dépôt) ;
 * 4. la base, et non le code, refuse UPDATE et DELETE sur un PDF déposé.
 */
import type {
  LegalDocumentFileDeposited,
  LegalDocumentFileHistoryView,
  LegalDocumentView,
  PublishedLegalDocumentView,
  RoleGrant,
} from "@lfd/contracts";

import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { prose } from "./legal-document-writes.js";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF", "latin1");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);

/** Un membre du staff dont le rôle n'accorde QUE ces droits. */
async function staffWith(key: string, grants: readonly RoleGrant[]): Promise<string> {
  await staff().post("/admin/staff-roles").send({ key, label: key, grants }).expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return sub;
}

async function deposit(mention: string, bytes: Buffer, name = "cgv.pdf") {
  return staff().post(`/admin/content/legal/${mention}/files`).attach("file", bytes, name);
}

describe("le droit `lfc_legal` (lot 0)", () => {
  it("sans `lfc_legal` : 403 sur les mentions, le pied de page reste ouvert", async () => {
    const sub = await staffWith("reglages", [{ resource: "b2b_settings", action: "write" }]);

    await ctx.asSub(sub).get("/admin/content/legal/salesTerms").expect(403);
    await ctx.asSub(sub).get("/admin/content/legal/salesTerms/files").expect(403);
    await ctx.asSub(sub).get("/admin/content/footer").expect(200);
  });

  it("avec `lfc_legal` seul : les mentions s'ouvrent, le pied de page non", async () => {
    const sub = await staffWith("juriste", [{ resource: "lfc_legal", action: "write" }]);

    await ctx.asSub(sub).get("/admin/content/legal/salesTermsPro").expect(200);
    await ctx.asSub(sub).get("/admin/content/footer").expect(403);
  });

  it("`lfc_legal:read` ne suffit pas pour écrire ni déposer", async () => {
    const sub = await staffWith("lecteur", [{ resource: "lfc_legal", action: "read" }]);

    await ctx
      .asSub(sub)
      .post("/admin/content/legal/salesTermsPro/paragraphs")
      .send({ ...prose("un"), expectedRevision: 0 })
      .expect(403);
    await ctx
      .asSub(sub)
      .post("/admin/content/legal/salesTerms/files")
      .attach("file", PDF, "cgv.pdf")
      .expect(403);
  });
});

describe("les CGV professionnelles (lot 1)", () => {
  /** C1′ : aucune ligne semée — l'absence se lit « en cours de rédaction ». */
  it("sont publiques et, jamais rédigées, rendent leur titre sans article", async () => {
    const view = jsonBody<LegalDocumentView>(
      await ctx.http().get("/content/legal/salesTermsPro").expect(200),
    );

    expect(view.revision).toBe(0);
    expect(view.content.paragraphs).toEqual([]);
    expect(view.content.title.fr).toBe("Conditions générales de vente professionnelles");
  });

  it("s'écrivent sur leur propre ligne, sans toucher aux CGV particuliers", async () => {
    await staff()
      .post("/admin/content/legal/salesTermsPro/paragraphs")
      .send({ ...prose("pro"), expectedRevision: 0 })
      .expect(201);

    const pro = jsonBody<LegalDocumentView>(
      await ctx.http().get("/content/legal/salesTermsPro").expect(200),
    );
    const consumers = jsonBody<LegalDocumentView>(
      await ctx.http().get("/content/legal/salesTerms").expect(200),
    );
    expect(pro.content.paragraphs.map((paragraph) => paragraph.fr.title)).toEqual(["Article pro"]);
    expect(consumers.revision).toBe(0);
    expect(
      await ctx.prisma.platformContent.findUnique({ where: { key: "sales-terms-pro" } }),
    ).not.toBeNull();
  });
});

describe("le PDF de référence (lot 2)", () => {
  it("refuse un fichier qui n'est pas un PDF (400), sans rien enregistrer", async () => {
    const refused = await deposit("salesTerms", PNG, "cgv.pdf");

    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain("PDF");
    expect(await ctx.prisma.legalDocumentFile.count()).toBe(0);
  });

  it("refuse un PDF sur une mention qui n'en porte pas (404)", async () => {
    expect((await deposit("privacy", PDF)).status).toBe(404);
  });

  it("aucun PDF déposé : le téléchargement public rend 404", async () => {
    await ctx.http().get("/content/legal/salesTermsPro/pdf").expect(404);
  });

  it("se dépose, se télécharge publiquement en attachment daté, et se remplace sans s'écraser", async () => {
    const first = jsonBody<LegalDocumentFileDeposited>(await deposit("salesTermsPro", PDF));
    const second = jsonBody<LegalDocumentFileDeposited>(
      await deposit("salesTermsPro", Buffer.concat([PDF, Buffer.from("\n")])),
    );

    const download = await ctx.http().get("/content/legal/salesTermsPro/pdf").expect(200);
    expect(download.headers["content-type"]).toBe("application/pdf");
    expect(download.headers["content-disposition"]).toMatch(
      /^attachment; filename="cgv-professionnels-\d{4}-\d{2}-\d{2}\.pdf"/u,
    );
    // L'ancien reste téléchargeable par son id : le PDF qu'une commande porte.
    await ctx.http().get(`/content/legal/salesTermsPro/files/${first.id}`).expect(200);
    // Mais pas sous l'AUTRE texte.
    await ctx.http().get(`/content/legal/salesTerms/files/${first.id}`).expect(404);

    const history = jsonBody<LegalDocumentFileHistoryView>(
      await staff().get("/admin/content/legal/salesTermsPro/files").expect(200),
    );
    expect(history.files.map((file) => [file.id, file.supersededAt === null])).toEqual([
      [second.id, true],
      [first.id, false],
    ]);
  });
});

/**
 * La lecture publique d'une mention annonce son PDF en vigueur (Hugo,
 * 2026-10-15 : « l'API doit le dire ») — la boutique ne le devine plus par une
 * sonde `HEAD` sur le téléchargement.
 */
describe("le PDF en vigueur, annoncé par la lecture publique", () => {
  async function published(mention: string): Promise<PublishedLegalDocumentView> {
    return jsonBody<PublishedLegalDocumentView>(
      await ctx.http().get(`/content/legal/${mention}`).expect(200),
    );
  }

  it("rend `pdf: null` tant que rien n'est déposé, et pour une mention sans PDF", async () => {
    expect((await published("salesTerms")).pdf).toBeNull();
    expect((await published("salesTermsPro")).pdf).toBeNull();
    expect((await published("privacy")).pdf).toBeNull();
  });

  it("annonce le dépôt, puis seulement son remplaçant — et pas sous l'autre texte", async () => {
    const first = jsonBody<LegalDocumentFileDeposited>(await deposit("salesTermsPro", PDF));
    const announced = (await published("salesTermsPro")).pdf;
    expect(announced).toMatchObject({ fileId: first.id, sizeBytes: PDF.length });
    expect(announced?.fileName).toMatch(/^cgv-professionnels-\d{4}-\d{2}-\d{2}\.pdf$/u);

    const replacement = Buffer.concat([PDF, Buffer.from("\n")]);
    const second = jsonBody<LegalDocumentFileDeposited>(
      await deposit("salesTermsPro", replacement),
    );

    expect((await published("salesTermsPro")).pdf).toMatchObject({
      fileId: second.id,
      sizeBytes: replacement.length,
    });
    expect((await published("salesTerms")).pdf).toBeNull();
  });
});

describe("la base refuse de réécrire un PDF déposé (C3′)", () => {
  async function depositedId(): Promise<string> {
    return jsonBody<LegalDocumentFileDeposited>(await deposit("salesTerms", PDF)).id;
  }

  it("refuse le DELETE", async () => {
    const id = await depositedId();

    await expect(
      ctx.prisma.$executeRaw`DELETE FROM public.legal_document_files WHERE id = ${id}`,
    ).rejects.toThrow(/ne se supprime pas/u);
    expect(await ctx.prisma.legalDocumentFile.count()).toBe(1);
  });

  it("refuse l'UPDATE d'une autre colonne que `superseded_at`", async () => {
    const id = await depositedId();

    await expect(
      ctx.prisma
        .$executeRaw`UPDATE public.legal_document_files SET sha256 = ${"b".repeat(64)} WHERE id = ${id}`,
    ).rejects.toThrow(/ne se réécrit pas/u);
  });

  it("admet la pose de `superseded_at` une fois, et refuse de la reposer ou de l'ôter", async () => {
    const id = await depositedId();

    await ctx.prisma
      .$executeRaw`UPDATE public.legal_document_files SET superseded_at = now() WHERE id = ${id}`;
    await expect(
      ctx.prisma
        .$executeRaw`UPDATE public.legal_document_files SET superseded_at = now() WHERE id = ${id}`,
    ).rejects.toThrow(/ne se réécrit pas/u);
    await expect(
      ctx.prisma
        .$executeRaw`UPDATE public.legal_document_files SET superseded_at = NULL WHERE id = ${id}`,
    ).rejects.toThrow(/ne se réécrit pas/u);
  });
});
