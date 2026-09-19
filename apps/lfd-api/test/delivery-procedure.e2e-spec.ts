/**
 * E2E de la **procédure de livraison** d'une adresse — sur un vrai Postgres et
 * un vrai MinIO.
 *
 * Ce que seuls le vrai SQL et le vrai stockage prouvent : que les positions
 * réécrites tiennent l'ordre sans unique en base, que la suppression d'une
 * étape part PHYSIQUEMENT avec sa photo du bucket, que la photo remplacée ne
 * traîne pas, que le multipart arrive jusqu'aux handlers champs ET fichier, et
 * que le mur tient : gestionnaire écrit, membre lit, étranger ne voit rien,
 * adresse archivée introuvable. Côté staff, que chaque geste laisse son fait au
 * journal, nominatif.
 */
import type {
  CompanyAddressesView,
  CreatedAddressResponse,
  CreatedDeliveryStepResponse,
  DeliveryProcedureView,
} from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, E2E_STAFF_ID, jsonBody, type E2eContext } from "./e2e-harness.js";
import { DELIVERY, photoOf, pngOf } from "./delivery-procedure-scene.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { storageKeys } from "./storage.js";

const ADMIN = "auth0|dp-admin";
const MEMBER = "auth0|dp-member";
const STAFF = "staff-e2e";

/** Staff doublé : le vérificateur staff accepte le jeton comme agent synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: STAFF, scopes: [] }),
};

const PORTAIL = pngOf(40, 30);
const COUR = pngOf(30, 40);

let ctx: E2eContext;
let companyId: string;
let addressId: string;
let otherCompanyId: string;
let otherAddressId: string;

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
  const admin = await createUser(ctx.prisma, { auth0Sub: ADMIN });
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Marais SAS" });
  const other = await createCompany(ctx.prisma, { raisonSociale: "Autre Maison SAS" });
  companyId = company.id;
  otherCompanyId = other.id;
  await attachTo(ctx.prisma, admin.id, companyId, CustomerRole.owner);
  await attachTo(ctx.prisma, member.id, companyId, CustomerRole.orders);
  addressId = await addDelivery(companyId, ADMIN);
  otherAddressId = await addDeliveryByStaff(otherCompanyId);
});

async function addDelivery(company: string, sub: string): Promise<string> {
  const response = await ctx
    .asSub(sub)
    .post(`/companies/${company}/delivery-addresses`)
    .send(DELIVERY)
    .expect(201);
  return jsonBody<CreatedAddressResponse>(response).id;
}

async function addDeliveryByStaff(company: string): Promise<string> {
  const response = await ctx
    .asSub(STAFF)
    .post(`/admin/companies/${company}/delivery-addresses`)
    .send(DELIVERY)
    .expect(201);
  return jsonBody<CreatedAddressResponse>(response).id;
}

/** Le chemin de la procédure, client ou staff. */
function procedure(side: "client" | "staff", company = companyId, address = addressId): string {
  const prefix = side === "client" ? "" : "/admin";
  return `${prefix}/companies/${company}/delivery-addresses/${address}/procedure`;
}

/** Ajoute une étape en multipart ; rend son identifiant. */
async function addStep(
  agent: request.Agent,
  base: string,
  title: string,
  photo: Buffer | null,
): Promise<string> {
  const pending = agent.post(`${base}/steps`).field("title", title).field("body", "");
  const response = await (
    photo === null ? pending : pending.attach("photo", photo, "porte.png")
  ).expect(201);
  return jsonBody<CreatedDeliveryStepResponse>(response).id;
}

async function read(agent: request.Agent, base: string): Promise<DeliveryProcedureView> {
  return jsonBody<DeliveryProcedureView>(await agent.get(base).expect(200));
}

/** Les objets du bucket des pièces client rangés sous cette adresse. */
async function storedPhotos(company = companyId, address = addressId): Promise<string[]> {
  const prefix = `companies/${company}/delivery-procedures/${address}/`;
  return (await storageKeys()).filter((key) => key.startsWith(prefix));
}

describe("le gestionnaire tient la procédure", () => {
  it("ajoute une étape avec photo, la sert, et le carnet en compte une", async () => {
    const admin = ctx.asSub(ADMIN);
    const stepId = await addStep(admin, procedure("client"), "Portail", PORTAIL);

    const view = await read(admin, procedure("client"));
    expect(view).toMatchObject({ addressId, steps: [{ id: stepId, number: 1, title: "Portail" }] });
    expect(view.steps[0]?.photoRevision).not.toBeNull();

    const served = await photoOf(admin, `${procedure("client")}/steps/${stepId}/photo`);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
    expect(served.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
    expect(Buffer.compare(served.body as Buffer, PORTAIL)).toBe(0);

    const addresses = jsonBody<CompanyAddressesView>(
      await admin.get(`/companies/${companyId}/addresses`).expect(200),
    );
    expect(addresses.deliveries.find((entry) => entry.id === addressId)?.procedureStepCount).toBe(
      1,
    );
  });

  it("refait une étape : la photo remplacée quitte le stockage, la retirée aussi", async () => {
    const admin = ctx.asSub(ADMIN);
    const stepId = await addStep(admin, procedure("client"), "Portail", PORTAIL);
    const [first] = await storedPhotos();
    const before = (await read(admin, procedure("client"))).steps[0]?.photoRevision;

    await admin
      .patch(`${procedure("client")}/steps/${stepId}`)
      .field("title", "Portail vert")
      .field("body", "Code 1234")
      .attach("photo", COUR, "cour.png")
      .expect(204);
    const revised = (await read(admin, procedure("client"))).steps[0];
    expect(revised).toMatchObject({ title: "Portail vert", body: "Code 1234" });
    expect(revised?.photoRevision).not.toBe(before);
    const afterReplace = await storedPhotos();
    expect(afterReplace).toHaveLength(1);
    expect(afterReplace).not.toContain(first);

    await admin
      .patch(`${procedure("client")}/steps/${stepId}`)
      .field("title", "Portail vert")
      .field("removePhoto", "true")
      .expect(204);
    await admin.get(`${procedure("client")}/steps/${stepId}/photo`).expect(404);
    expect(await storedPhotos()).toEqual([]);
  });

  it("refuse « retirer » et une photo jointe ensemble, et une photo qui n'est pas une image", async () => {
    const admin = ctx.asSub(ADMIN);
    const stepId = await addStep(admin, procedure("client"), "Portail", null);
    await admin
      .patch(`${procedure("client")}/steps/${stepId}`)
      .field("title", "Portail")
      .field("removePhoto", "true")
      .attach("photo", PORTAIL, "porte.png")
      .expect(400);
    await admin
      .post(`${procedure("client")}/steps`)
      .field("title", "Portail")
      .attach("photo", Buffer.from("%PDF-1.4", "latin1"), "porte.png")
      .expect(400);
    await admin
      .post(`${procedure("client")}/steps`)
      .field("title", "  ")
      .expect(400);
    expect(await storedPhotos()).toEqual([]);
  });

  it("réordonne, et refuse un ordre périmé en disant de recharger (409)", async () => {
    const admin = ctx.asSub(ADMIN);
    const portail = await addStep(admin, procedure("client"), "Portail", null);
    const cour = await addStep(admin, procedure("client"), "Cour", null);
    const porte = await addStep(admin, procedure("client"), "Porte", null);

    await admin
      .put(`${procedure("client")}/order`)
      .send({ stepIds: [porte, portail, cour] })
      .expect(204);
    const view = await read(admin, procedure("client"));
    expect(view.steps.map((step) => [step.number, step.title])).toEqual([
      [1, "Porte"],
      [2, "Portail"],
      [3, "Cour"],
    ]);

    const stale = await admin
      .put(`${procedure("client")}/order`)
      .send({ stepIds: [portail, cour] })
      .expect(409);
    expect(JSON.stringify(stale.body)).toContain("Rechargez");
  });

  it("supprime définitivement : l'étape, sa ligne, sa photo, puis 404 sur la photo", async () => {
    const admin = ctx.asSub(ADMIN);
    const stepId = await addStep(admin, procedure("client"), "Portail", PORTAIL);
    await admin.delete(`${procedure("client")}/steps/${stepId}`).expect(204);

    await admin.get(`${procedure("client")}/steps/${stepId}/photo`).expect(404);
    expect((await read(admin, procedure("client"))).steps).toEqual([]);
    expect(await ctx.prisma.deliveryProcedureStep.count({ where: { id: stepId } })).toBe(0);
    expect(await storedPhotos()).toEqual([]);
  });
});

/**
 * Régression : le `save` supprime les étapes absentes de l'agrégat chargé. Deux
 * ajouts simultanés chargeaient chacun la procédure d'avant, et le second
 * effaçait l'étape du premier (corrigé le 2026-09-15 par un verrou consultatif).
 */
describe("deux écritures simultanées sur la même procédure", () => {
  it("gardent les deux étapes ajoutées en même temps", async () => {
    const admin = ctx.asSub(ADMIN);
    const ids = await Promise.all([
      addStep(admin, procedure("client"), "Portail", PORTAIL),
      addStep(ctx.asSub(STAFF), procedure("staff"), "Cour", COUR),
      addStep(admin, procedure("client"), "Porte", null),
    ]);

    const view = await read(admin, procedure("client"));
    expect(view.steps.map((step) => step.id).sort()).toEqual([...ids].sort());
    expect(view.steps.map((step) => step.number)).toEqual([1, 2, 3]);
    expect(await ctx.prisma.deliveryProcedure.count()).toBe(1);
    expect(await storedPhotos()).toHaveLength(2);
  });
});

describe("le mur", () => {
  it("un simple membre lit la procédure et sa photo, mais n'écrit pas (403)", async () => {
    const stepId = await addStep(ctx.asSub(ADMIN), procedure("client"), "Portail", PORTAIL);
    const member = ctx.asSub(MEMBER);

    expect((await read(member, procedure("client"))).steps).toHaveLength(1);
    await photoOf(member, `${procedure("client")}/steps/${stepId}/photo`);
    await member
      .post(`${procedure("client")}/steps`)
      .field("title", "Intrus")
      .expect(403);
    await member
      .put(`${procedure("client")}/order`)
      .send({ stepIds: [stepId] })
      .expect(403);
    await member.delete(`${procedure("client")}/steps/${stepId}`).expect(403);
  });

  it("l'adresse d'une autre société est introuvable (404), par l'une ou l'autre URL", async () => {
    const admin = ctx.asSub(ADMIN);
    await admin.get(procedure("client", companyId, otherAddressId)).expect(404);
    await admin
      .post(`${procedure("client", companyId, otherAddressId)}/steps`)
      .field("title", "Intrus")
      .expect(404);
    await admin.get(procedure("client", otherCompanyId, otherAddressId)).expect(404);
    expect(await ctx.prisma.deliveryProcedure.count()).toBe(0);
  });

  it("une adresse archivée n'a plus de procédure lisible (404), côté client comme staff", async () => {
    const admin = ctx.asSub(ADMIN);
    await addStep(admin, procedure("client"), "Portail", null);
    await admin.delete(`/companies/${companyId}/delivery-addresses/${addressId}`).expect(204);

    await admin.get(procedure("client")).expect(404);
    await ctx.asSub(STAFF).get(procedure("staff")).expect(404);
  });
});

describe("le staff tient la procédure d'un client", () => {
  it("fait les mêmes gestes, et chacun laisse son fait nominatif au journal", async () => {
    const staff = ctx.asSub(STAFF);
    const base = procedure("staff");
    const portail = await addStep(staff, base, "Portail", PORTAIL);
    const cour = await addStep(staff, base, "Cour", null);
    await staff.patch(`${base}/steps/${cour}`).field("title", "Cour intérieure").expect(204);
    await staff
      .put(`${base}/order`)
      .send({ stepIds: [cour, portail] })
      .expect(204);
    await photoOf(staff, `${base}/steps/${portail}/photo`);
    await staff.delete(`${base}/steps/${portail}`).expect(204);

    const view = await read(staff, base);
    expect(view.steps.map((step) => step.title)).toEqual(["Cour intérieure"]);
    expect(await storedPhotos()).toEqual([]);

    await ctx.drain();
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: companyId, type: "company.delivery_procedure_edited" },
      orderBy: { occurredAt: "asc" },
      select: { actorId: true, payload: true },
    });
    expect(journal.map((entry) => entry.payload)).toEqual(
      ["step_added", "step_added", "step_revised", "reordered", "step_removed"].map((action) => ({
        // La société est le sujet (nommée) ; l'adresse, citée par son id et son
        // lieu — jamais son libellé (lot B du plan des phrases).
        subjectLabel: "Boulangerie du Marais SAS",
        address: { id: addressId, ville: DELIVERY.ville, codePostal: DELIVERY.codePostal },
        action,
      })),
    );
    // Nominatif par la FICHE, plus par le `sub` du jeton (plan de l'auteur, D1).
    expect(journal.every((entry) => entry.actorId === E2E_STAFF_ID)).toBe(true);
  });

  /**
   * Le gestionnaire écrit le MÊME fait que l'agent, sous son id `users` : la
   * règle « il n'engage que lui » est tombée le 2026-09-19 (plan du journal,
   * lot 1, tranche (c)) — ce test disait l'inverse jusque-là.
   */
  it("le gestionnaire laisse le même fait au journal, sous son id `users`", async () => {
    await addStep(ctx.asSub(ADMIN), procedure("client"), "Portail", null);
    await ctx.drain();
    const admin = await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: ADMIN } });
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { type: "company.delivery_procedure_edited" },
      select: { actorType: true, actorId: true, payload: true },
    });
    expect(journal).toEqual([
      {
        actorType: "customer",
        actorId: admin.id,
        payload: {
          subjectLabel: "Boulangerie du Marais SAS",
          address: { id: addressId, ville: DELIVERY.ville, codePostal: DELIVERY.codePostal },
          action: "step_added",
        },
      },
    ]);
  });
});
