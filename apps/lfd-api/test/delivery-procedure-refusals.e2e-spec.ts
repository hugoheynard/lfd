/**
 * E2E des **refus de la procédure de livraison, mot pour mot** — et des
 * en-têtes de sa photo.
 *
 * Le 2026-10-06, cinq comportements figés ici ont été corrigés (TODO
 * `documentation/livraisons/todo-etrangetes-procedure-de-livraison.md`) : les
 * tests qui les tenaient sont réécrits vers le nouveau comportement et nommés
 * d'après le symptôme corrigé.
 *
 * Un filet de caractérisation (`documentation/b2b/comptes-client/notes-du-commercial.md`) : il fige ce que le code EN PRODUCTION renvoie, avant que la procédure ne
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
  DELIVERY,
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
  /**
   * Régression : le schéma du contrat refusait avant le value object, en
   * message Zod anglais (« Too big: expected string to have <=80 characters »)
   * — fix 2026-10-06, le contrat ne valide plus que la forme.
   */
  it("le contenu refusé l'est par le domaine, en français et avec le geste de sortie (400)", async () => {
    const agent = agentOf(side);
    const post = (title: string, body: string): request.Test =>
      agent
        .post(`${procedure(side)}/steps`)
        .field("title", title)
        .field("body", body)
        .expect(400);

    expect(refusalOf(await post("  ", ""))).toEqual(
      REFUSED.step("le titre est vide. Donnez un titre à l'étape."),
    );
    expect(refusalOf(await post("x".repeat(81), ""))).toEqual(
      REFUSED.step(
        "le titre fait 81 caractères, 80 au plus. " +
          "Raccourcissez-le et mettez le détail dans le texte.",
      ),
    );
    expect(refusalOf(await post("Portail", "x".repeat(1001)))).toEqual(
      REFUSED.step("le texte fait 1001 caractères, 1000 au plus. Découpez-le en deux étapes."),
    );

    const stepId = await addStep(side, "Portail");
    const patched = await agent
      .patch(`${procedure(side)}/steps/${stepId}`)
      .field("title", "")
      .expect(400);
    expect(refusalOf(patched)).toEqual(
      REFUSED.step("le titre est vide. Donnez un titre à l'étape."),
    );
    expect(await storageKeys()).toEqual([]);
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
   * Régression : au-delà de 2 Mo, Multer coupait en `413 { message: "File too
   * large" }`, sans code ni geste de sortie (fix 2026-10-06). Multer n'a pas lu
   * le reste : le refus dit « plus de 2 Mo », jamais un poids inventé.
   */
  it("une photo au-delà du backstop multipart est refusée dans les mots de la photo, en ajout comme en révision", async () => {
    const stepId = await addStep("client", "Portail");
    // L'ajout de mise en place écrit son fait depuis le 2026-09-19 (le client
    // est journalisé aussi) : ce qu'on vérifie, c'est que les REFUS n'en
    // ajoutent aucun.
    const facts = { type: "company.delivery_procedure_edited" };
    await ctx.drain();
    const before = await ctx.prisma.activityEvent.count({ where: facts });
    const refusals = [
      await postPhoto(side, OVER_UPLOAD_LIMIT).expect(400),
      await agentOf(side)
        .patch(`${procedure(side)}/steps/${stepId}`)
        .field("title", "Portail")
        .attach("photo", OVER_UPLOAD_LIMIT, "porte.png")
        .expect(400),
    ];
    expect(refusals.map(bodyWithoutRequestId)).toEqual(
      refusals.map(() =>
        REFUSED.photo(
          "elle pèse plus de 2,0 Mo, la limite est de 1,0 Mo. " +
            "Reprenez-la depuis l'écran de la procédure, qui la réduit avant l'envoi.",
        ),
      ),
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

  /**
   * Régression : un ordre vide sortait en 400 Zod anglais (« Too small:
   * expected array to have >=1 items ») — fix 2026-10-06 : ce n'est pas une
   * permutation des étapes, il est périmé comme les autres.
   */
  it("un ordre qui n'est pas une permutation exacte est périmé (409), vide compris", async () => {
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
      [],
    ]) {
      expect(refusalOf(await order(stepIds).expect(409))).toEqual(REFUSED.stale);
    }
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
  /**
   * Régression : remplacer ou retirer la photo s'écrivait `step_revised`, et le
   * journal ne distinguait pas le geste sur la photo (fix 2026-10-06).
   */
  it("un changement de photo se nomme pour lui-même, et un refus ne laisse aucun fait", async () => {
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
      ["step_added", "step_photo_replaced", "step_photo_removed"].map((action) => ({
        // La société est le sujet (nommée) ; l'adresse, citée par son id et son
        // lieu — jamais son libellé (lot B du plan des phrases).
        subjectLabel: "Boulangerie du Marais SAS",
        address: { id: addressId, ville: DELIVERY.ville, codePostal: DELIVERY.codePostal },
        action,
      })),
    );
  });
});
