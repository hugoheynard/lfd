/**
 * E2E des **refus de la procédure de livraison, mot pour mot** — et des
 * en-têtes de sa photo.
 *
 * Un filet de caractérisation (plan `documentation/b2b/plan-notes-photo-du-commercial.md`,
 * D9) : il fige ce que le code EN PRODUCTION renvoie, avant que la procédure ne
 * délègue à un socle partagé. Les messages sont affichés tels quels à l'écran,
 * client comme staff : un message qui change est un changement observable, même
 * sous le même statut.
 *
 * Les textes sont écrits EN CLAIR, pas importés des classes d'erreur : importer
 * la classe ferait suivre le test au code qu'il doit tenir immobile.
 */
import type { CreatedDeliveryStepResponse } from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bodyWithoutRequestId,
  GHOST_STEP,
  jpegOf,
  OVER_UPLOAD_LIMIT,
  photoOf,
  pngOf,
  REFUSED,
  REFUSED_PHOTOS,
  refusalOf,
  seedCompanyWithDelivery,
  staffVerifier,
  UNKNOWN_ADDRESS,
} from "./delivery-procedure-scene.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { storageKeys } from "./storage.js";

const ADMIN = "auth0|dpr-admin";
const MEMBER = "auth0|dpr-member";
const STAFF = "staff-e2e";

const SIDES = ["client", "staff"] as const;
type Side = (typeof SIDES)[number];

let ctx: E2eContext;
let companyId: string;
let addressId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: staffVerifier(STAFF) }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  ({ companyId, addressId } = await seedCompanyWithDelivery(ctx, ADMIN, MEMBER));
});

/** Le demandeur de chaque porte : le gestionnaire, ou l'agent. */
function agentOf(side: Side): request.Agent {
  return ctx.asSub(side === "client" ? ADMIN : STAFF);
}

function procedure(side: Side, address = addressId): string {
  const prefix = side === "client" ? "" : "/admin";
  return `${prefix}/companies/${companyId}/delivery-addresses/${address}/procedure`;
}

async function addStep(side: Side, title: string, photo: Buffer | null = null): Promise<string> {
  const pending = agentOf(side)
    .post(`${procedure(side)}/steps`)
    .field("title", title);
  const response = await (
    photo === null ? pending : pending.attach("photo", photo, "porte.png")
  ).expect(201);
  return jsonBody<CreatedDeliveryStepResponse>(response).id;
}

/** Poste une étape avec cette photo ; rend la réponse, quel que soit son statut. */
function postPhoto(side: Side, photo: Buffer): request.Test {
  return agentOf(side)
    .post(`${procedure(side)}/steps`)
    .field("title", "Portail")
    .attach("photo", photo, { filename: "porte.jpg", contentType: "image/jpeg" });
}

describe.each(SIDES)("les refus, mot pour mot — porte %s", (side) => {
  it("le contenu mal formé est refusé par la forme, avant le domaine (400)", async () => {
    const agent = agentOf(side);
    const post = (title: string, body: string): request.Test =>
      agent
        .post(`${procedure(side)}/steps`)
        .field("title", title)
        .field("body", body)
        .expect(400);

    expect(refusalOf(await post("  ", ""))).toEqual(REFUSED.payload("title : titre requis"));
    expect(refusalOf(await post("x".repeat(81), ""))).toEqual(
      REFUSED.payload("title : Too big: expected string to have <=80 characters"),
    );
    expect(refusalOf(await post("Portail", "x".repeat(1001)))).toEqual(
      REFUSED.payload("body : Too big: expected string to have <=1000 characters"),
    );

    const stepId = await addStep(side, "Portail");
    const patched = await agent
      .patch(`${procedure(side)}/steps/${stepId}`)
      .field("title", "")
      .expect(400);
    expect(refusalOf(patched)).toEqual(REFUSED.payload("title : titre requis"));
  });

  it("la photo refusée dit pourquoi et quoi faire (400), sans rien laisser au stockage", async () => {
    for (const [bytes, reason] of REFUSED_PHOTOS) {
      expect(refusalOf(await postPhoto(side, bytes).expect(400))).toEqual(REFUSED.photo(reason));
    }

    const stepId = await addStep(side, "Portail");
    const ambiguous = await agentOf(side)
      .patch(`${procedure(side)}/steps/${stepId}`)
      .field("title", "Portail")
      .field("removePhoto", "true")
      .attach("photo", pngOf(40, 30), "porte.png")
      .expect(400);
    expect(refusalOf(ambiguous)).toEqual(REFUSED.ambiguous);
    expect(await storageKeys()).toEqual([]);
  });

  /**
   * Au-delà de 2 Mo, c'est Multer qui coupe, pas le domaine : le corps n'est
   * pas une `AppError`, et il est figé tel quel.
   */
  it("une photo au-delà du backstop multipart est coupée, en ajout comme en révision", async () => {
    const stepId = await addStep("client", "Portail");
    // L'ajout de mise en place écrit son fait depuis le 2026-09-19 (le client
    // est journalisé aussi) : ce qu'on vérifie, c'est que les REFUS n'en
    // ajoutent aucun.
    const facts = { type: "company.delivery_procedure_edited" };
    await ctx.drain();
    const before = await ctx.prisma.activityEvent.count({ where: facts });
    const refusals = [
      await postPhoto(side, OVER_UPLOAD_LIMIT).expect(413),
      await agentOf(side)
        .patch(`${procedure(side)}/steps/${stepId}`)
        .field("title", "Portail")
        .attach("photo", OVER_UPLOAD_LIMIT, "porte.png")
        .expect(413),
    ];
    expect(refusals.map(bodyWithoutRequestId)).toEqual(
      refusals.map(() => ({
        message: "File too large",
        error: "Payload Too Large",
        statusCode: 413,
      })),
    );
    expect(await storageKeys()).toEqual([]);
    await ctx.drain();
    expect(await ctx.prisma.activityEvent.count({ where: facts })).toBe(before);
  });

  it("une photo vide est refusée (400)", async () => {
    const empty = await postPhoto(side, Buffer.alloc(0)).expect(400);
    expect(refusalOf(empty)).toEqual(REFUSED.photo("le fichier est vide. Reprenez la photo."));
  });

  it("l'étape inconnue est introuvable (404), avec ou sans procédure", async () => {
    const agent = agentOf(side);
    const ghost = `${procedure(side)}/steps/${GHOST_STEP}`;
    expect(refusalOf(await agent.delete(ghost).expect(404))).toEqual(REFUSED.stepNotFound);
    expect(refusalOf(await agent.patch(ghost).field("title", "x").expect(404))).toEqual(
      REFUSED.stepNotFound,
    );

    const stepId = await addStep(side, "Portail");
    expect(refusalOf(await agent.delete(ghost).expect(404))).toEqual(REFUSED.stepNotFound);
    expect(refusalOf(await agent.patch(ghost).field("title", "x").expect(404))).toEqual(
      REFUSED.stepNotFound,
    );
    expect(refusalOf(await agent.get(`${ghost}/photo`).expect(404))).toEqual(REFUSED.noPhoto);
    const withoutPhoto = await agent.get(`${procedure(side)}/steps/${stepId}/photo`).expect(404);
    expect(refusalOf(withoutPhoto)).toEqual(REFUSED.noPhoto);
  });

  it("un ordre qui n'est pas une permutation exacte est périmé (409)", async () => {
    const agent = agentOf(side);
    const order = (stepIds: readonly string[]): request.Test =>
      agent.put(`${procedure(side)}/order`).send({ stepIds });

    expect(refusalOf(await order([GHOST_STEP]).expect(409))).toEqual(REFUSED.stale);
    const first = await addStep(side, "Portail");
    const second = await addStep(side, "Cour");
    for (const stepIds of [
      [first],
      [first, first],
      [first, second, GHOST_STEP],
      [first, GHOST_STEP],
    ]) {
      expect(refusalOf(await order(stepIds).expect(409))).toEqual(REFUSED.stale);
    }
    expect(refusalOf(await order([]).expect(400))).toEqual(
      REFUSED.payload("stepIds : Too small: expected array to have >=1 items"),
    );
  });

  it("une adresse inconnue ou archivée est introuvable, en lecture comme en écriture (404)", async () => {
    const stepId = await addStep(side, "Portail");
    await ctx
      .asSub(ADMIN)
      .delete(`/companies/${companyId}/delivery-addresses/${addressId}`)
      .expect(204);
    const agent = agentOf(side);

    for (const address of [UNKNOWN_ADDRESS, addressId]) {
      const base = procedure(side, address);
      const refusals = [
        await agent.get(base).expect(404),
        await agent.post(`${base}/steps`).field("title", "Portail").expect(404),
        await agent.patch(`${base}/steps/${stepId}`).field("title", "Portail").expect(404),
        await agent.delete(`${base}/steps/${stepId}`).expect(404),
        await agent
          .put(`${base}/order`)
          .send({ stepIds: [stepId] })
          .expect(404),
        await agent.get(`${base}/steps/${stepId}/photo`).expect(404),
      ];
      expect(refusals.map(refusalOf)).toEqual(refusals.map(() => REFUSED.addressNotFound));
    }
  });

  it("la photo servie porte le type relu des octets, nosniff et un cache privé immuable", async () => {
    const jpeg = jpegOf(40, 30);
    const stepId = await addStep(side, "Portail", jpeg);
    const served = await photoOf(agentOf(side), `${procedure(side)}/steps/${stepId}/photo`);
    expect(served.headers["content-type"]).toBe("image/jpeg");
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
    expect(served.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
    expect(Buffer.compare(served.body as Buffer, jpeg)).toBe(0);
  });
});

describe("les refus qui se posent une fois pour les deux portes", () => {
  it("la 21e étape est refusée par la borne (409), côté client comme staff", async () => {
    for (let index = 1; index <= 20; index += 1) {
      await addStep("client", `Étape ${String(index)}`);
    }
    for (const side of SIDES) {
      const refused = await agentOf(side)
        .post(`${procedure(side)}/steps`)
        .field("title", "De trop")
        .expect(409);
      expect(refusalOf(refused)).toEqual(REFUSED.full);
    }
  });

  it("un membre non gestionnaire n'écrit pas, et le refus le dit (403)", async () => {
    const stepId = await addStep("client", "Portail");
    const member = ctx.asSub(MEMBER);
    const base = procedure("client");
    const refusals = [
      await member.post(`${base}/steps`).field("title", "Intrus").expect(403),
      await member.patch(`${base}/steps/${stepId}`).field("title", "Intrus").expect(403),
      await member.delete(`${base}/steps/${stepId}`).expect(403),
      await member
        .put(`${base}/order`)
        .send({ stepIds: [stepId] })
        .expect(403),
    ];
    expect(refusals.map(refusalOf)).toEqual(refusals.map(() => REFUSED.adminRequired));
  });
});

describe("le journal des gestes staff", () => {
  it("un changement de photo est un `step_revised`, et un refus ne laisse aucun fait", async () => {
    const stepId = await addStep("staff", "Portail", pngOf(40, 30));
    const step = `${procedure("staff")}/steps/${stepId}`;
    const staff = agentOf("staff");
    await staff
      .patch(step)
      .field("title", "Portail")
      .attach("photo", jpegOf(30, 40), "cour.jpg")
      .expect(204);
    await staff.patch(step).field("title", "Portail").field("removePhoto", "true").expect(204);
    await staff
      .put(`${procedure("staff")}/order`)
      .send({ stepIds: [GHOST_STEP] })
      .expect(409);
    await staff
      .patch(`${procedure("staff")}/steps/${GHOST_STEP}`)
      .field("title", "x")
      .expect(404);
    await postPhoto("staff", Buffer.from("%PDF-1.4", "latin1")).expect(400);

    await ctx.drain();
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: companyId, type: "company.delivery_procedure_edited" },
      orderBy: { occurredAt: "asc" },
      select: { payload: true },
    });
    expect(journal.map((entry) => entry.payload)).toEqual(
      ["step_added", "step_revised", "step_revised"].map((action) => ({
        companyId,
        addressId,
        action,
      })),
    );
  });
});
