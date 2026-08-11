/**
 * E2E du **KBIS** : dépôt muré (gestionnaire), téléchargement muré (tout membre),
 * et son reflet dans `GET /me` (présence + badge certifié dérivé du statut).
 *
 * Le stockage objet (R2) est **doublé** par un magasin en mémoire — c'est une
 * frontière sortante, pas ce qu'un e2e éprouve. Tout le reste est réel : le mur
 * via `memberships`, les métadonnées en base, le contrat HTTP.
 */
import { KbisStore } from "../src/account/domain/ports/kbis-store.js";
import type { KbisFile } from "../src/account/domain/value-objects/kbis-file.js";
import { CompanyStatus, CustomerRole } from "../src/infra/database/client/client.js";
import type { AccountView } from "../src/account/domain/ports/account.reader.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const ADMIN = "auth0|admin";
const PDF = Buffer.from("%PDF-1.4\nfake kbis", "latin1");

/** Magasin objet en mémoire — clé → octets. */
class FakeKbisStore extends KbisStore {
  readonly saved = new Map<string, Buffer>();

  save(companyId: string, file: KbisFile): Promise<string> {
    const key = `companies/${companyId}/kbis.pdf`;
    this.saved.set(key, file.bytes);
    return Promise.resolve(key);
  }

  read(storageKey: string): Promise<Buffer> {
    const bytes = this.saved.get(storageKey);
    if (bytes === undefined) {
      return Promise.reject(new Error(`clé absente du fake store : ${storageKey}`));
    }
    return Promise.resolve(bytes);
  }
}

let ctx: E2eContext;
let store: FakeKbisStore;
let companyId: string;

beforeAll(async () => {
  store = new FakeKbisStore();
  ctx = await bootstrapE2e({ overrides: [{ token: KbisStore, value: store }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  store.saved.clear();
  const admin = await createUser(ctx.prisma, { auth0Sub: ADMIN, email: "gerant@pqmarais.fr" });
  const company = await createCompany(ctx.prisma, {
    raisonSociale: "Boulangerie du Marais SAS",
    status: CompanyStatus.pending,
  });
  companyId = company.id;
  await attachTo(ctx.prisma, admin.id, companyId, CustomerRole.owner);
});

/** L'entreprise `companyId` dans le `/me` d'un sub. */
async function companyOf(sub: string): Promise<AccountView["companies"][number]> {
  const response = await ctx.asSub(sub).get("/me").expect(200);
  const found = jsonBody<AccountView>(response).companies.find((c) => c.id === companyId);
  if (found === undefined) {
    throw new Error("entreprise absente du /me");
  }
  return found;
}

describe("dépôt du KBIS", () => {
  it("le gestionnaire dépose ; /me l'expose, non certifié tant que l'entreprise est en attente", async () => {
    await ctx
      .asSub(ADMIN)
      .put(`/companies/${companyId}/kbis`)
      .attach("file", PDF, "extrait-kbis.pdf")
      .expect(204);

    const company = await companyOf(ADMIN);
    expect(company.kbis).toMatchObject({ fileName: "extrait-kbis.pdf", certified: false });
    expect(company.kbis?.uploadedAt).toBeTruthy();

    // Pièce d'activation « KBIS » journalisée (câblage ingestKbis→growth), clé
    // par (société, étape) → idempotente sur re-dépôt.
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if ((await ctx.prisma.activityEvent.count({ where: { type: "company.step_reached" } })) > 0) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
    const [step] = await ctx.prisma.activityEvent.findMany({
      where: { type: "company.step_reached" },
    });
    expect(step.subjectId).toBe(companyId);
    expect(step.idempotencyKey).toBe(`company.step_reached:kbis:${companyId}`);
    expect(step.payload).toMatchObject({ step: "kbis" });
  });

  it("est certifié quand le staff pose kbis_certified_at (découplé du statut)", async () => {
    await ctx
      .asSub(ADMIN)
      .put(`/companies/${companyId}/kbis`)
      .attach("file", PDF, "k.pdf")
      .expect(204);
    // La certification est **propre au fichier**, pas dérivée du statut : c'est
    // le staff qui pose `kbis_certified_at` (l'endpoint de certification, §3, est
    // à venir — ici on simule son écriture). Le reader lit
    // `certified = kbis_certified_at != null`.
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { kbisCertifiedAt: new Date() },
    });

    expect((await companyOf(ADMIN)).kbis?.certified).toBe(true);
  });

  it("refuse un fichier qui n'est pas un PDF (400), rien n'est stocké", async () => {
    const response = await ctx
      .asSub(ADMIN)
      .put(`/companies/${companyId}/kbis`)
      .attach("file", Buffer.from("pas un pdf"), "faux.pdf");

    expect(response.status).toBe(400);
    expect(store.saved.size).toBe(0);
  });

  it("refuse un simple membre (403) et un non-membre (404)", async () => {
    const membre = await createUser(ctx.prisma, { auth0Sub: "auth0|membre" });
    await attachTo(ctx.prisma, membre.id, companyId, CustomerRole.orders);
    await createUser(ctx.prisma, { auth0Sub: "auth0|etranger" });

    const asMember = await ctx
      .asSub("auth0|membre")
      .put(`/companies/${companyId}/kbis`)
      .attach("file", PDF, "k.pdf");
    expect(asMember.status).toBe(403);

    const asStranger = await ctx
      .asSub("auth0|etranger")
      .put(`/companies/${companyId}/kbis`)
      .attach("file", PDF, "k.pdf");
    expect(asStranger.status).toBe(404);
  });
});

describe("téléchargement du KBIS", () => {
  beforeEach(async () => {
    await ctx
      .asSub(ADMIN)
      .put(`/companies/${companyId}/kbis`)
      .attach("file", PDF, "k.pdf")
      .expect(204);
  });

  it("sert le fichier à un simple membre, en pièce jointe", async () => {
    const membre = await createUser(ctx.prisma, { auth0Sub: "auth0|membre" });
    await attachTo(ctx.prisma, membre.id, companyId, CustomerRole.orders);

    const response = await ctx
      .asSub("auth0|membre")
      .get(`/companies/${companyId}/kbis`)
      .expect(200);

    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(
      Buffer.from(response.body as Buffer)
        .subarray(0, 5)
        .toString("latin1"),
    ).toBe("%PDF-");
  });

  it("cache le fichier à un non-membre (404)", async () => {
    await createUser(ctx.prisma, { auth0Sub: "auth0|etranger" });
    await ctx.asSub("auth0|etranger").get(`/companies/${companyId}/kbis`).expect(404);
  });

  it("empêche le gestionnaire d'une autre entreprise de le récupérer (isolation)", async () => {
    const autre = await createUser(ctx.prisma, { auth0Sub: "auth0|autre" });
    const autreCompany = await createCompany(ctx.prisma, {
      raisonSociale: "Torréfaction B SARL",
      siret: "98765432100023",
    });
    await attachTo(ctx.prisma, autre.id, autreCompany.id, CustomerRole.owner);

    await ctx.asSub("auth0|autre").get(`/companies/${companyId}/kbis`).expect(404);
  });
});
