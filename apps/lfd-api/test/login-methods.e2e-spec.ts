/**
 * E2E des **méthodes de connexion** — `GET`/`POST /me/identities` et
 * `DELETE /me/identities/:provider` (plan
 * `documentation/auth-inscription/plan-rattachement-depuis-le-profil.md`, lot B).
 *
 * Deux frontières **sortantes** sont doublées, et elles seules : la
 * vérification du jeton de preuve (un tenant distant et des clés privées) et le
 * fournisseur d'identité (une Management API). Tout le reste est réel — le
 * guard, le bus, les handlers, et surtout **le vrai SQL** : c'est la seule
 * façon d'éprouver le refus qui compte, « ce compte tiers ouvre déjà un autre
 * compte chez nous », qui se lit dans `users` et nulle part ailleurs.
 *
 * Le double de preuve est trivial et suit celui du harnais : **le jeton EST le
 * sujet prouvé**.
 */
import { DevCustomerIdentity } from "../src/b2b/account/infrastructure/dev-customer-identity.js";
import { CustomerIdentityPort } from "../src/b2b/account/domain/ports/customer-identity.port.js";
import {
  IdentityProofVerifier,
  type IdentityProof,
} from "../src/b2b/account/domain/ports/identity-proof.verifier.js";
import type { LoginMethodsView } from "@lfd/contracts";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

const SUB = "auth0|camille";
const GOOGLE_SUB = "google-oauth2|10203040";
const GOOGLE_PROVIDER = "google-oauth2";

/** Le jeton porté EST le sujet qu'il prouve — même triche que le harnais. */
const proofDouble: IdentityProofVerifier = {
  verify: (idToken: string): Promise<IdentityProof> => Promise.resolve({ subject: idToken }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: IdentityProofVerifier, value: proofDouble },
      // L'adaptateur de développement plutôt que celui d'Auth0, quoi que
      // l'environnement porte : un e2e ne doit pas dépendre de la présence
      // d'un secret M2M pour choisir ce qu'il éprouve.
      { token: CustomerIdentityPort, value: new DevCustomerIdentity() },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: SUB, email: "camille@ancienne.fr" });
});

const me = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(SUB);

async function link(idToken: string, status: number): Promise<LoginMethodsView> {
  const response = await me().post("/me/identities").send({ idToken }).expect(status);
  return jsonBody<LoginMethodsView>(response);
}

/** Les faits inscrits au journal pour la personne, dans l'ordre. */
async function identityFacts(): Promise<{ type: string; payload: unknown }[]> {
  return ctx.prisma.activityEvent.findMany({
    where: { type: { in: ["user.identity_linked", "user.identity_revoked"] } },
    orderBy: { id: "asc" },
    select: { type: true, payload: true },
  });
}

describe("GET /me/identities", () => {
  it("rend la méthode qui porte le compte, sans identifiant du fournisseur", async () => {
    const response = await me().get("/me/identities").expect(200);

    const methods = jsonBody<LoginMethodsView>(response);
    expect(methods).toEqual([{ provider: "auth0", connection: null, isPrimary: true }]);
    expect(JSON.stringify(methods)).not.toContain("camille");
  });

  it("refuse un porteur inconnu", async () => {
    await ctx.http().get("/me/identities").expect(401);
  });
});

describe("POST /me/identities", () => {
  it("rattache et renvoie la liste relue", async () => {
    const methods = await link(GOOGLE_SUB, 200);

    expect(methods).toEqual([
      { provider: "auth0", connection: null, isPrimary: true },
      { provider: GOOGLE_PROVIDER, connection: null, isPrimary: false },
    ]);
  });

  it("inscrit le fait, sans jamais y mettre le sujet secondaire", async () => {
    await link(GOOGLE_SUB, 200);
    await ctx.drain();

    const facts = await identityFacts();
    expect(facts).toEqual([
      {
        type: "user.identity_linked",
        payload: {
          // Le nom de la personne, figé au geste — ce n'est pas une coordonnée.
          subjectLabel: "Camille Durand",
          provider: GOOGLE_PROVIDER,
          connection: null,
          linkedVia: "profile",
        },
      },
    ]);
    expect(JSON.stringify(facts)).not.toContain("10203040");
  });

  /**
   * 🔴 Le refus qui compte, et il ne s'éprouve qu'ici : il se lit dans `users`.
   * Sans lui, la ligne de l'autre compte deviendrait inatteignable — son sujet
   * ne produirait plus jamais de jeton — sans que rien ne le dise.
   */
  it("refuse un compte tiers qui ouvre déjà un AUTRE compte chez nous", async () => {
    await createUser(ctx.prisma, { auth0Sub: GOOGLE_SUB, email: "autre@exemple.fr" });

    await link(GOOGLE_SUB, 409);

    await ctx.drain();
    expect(await identityFacts()).toEqual([]);
  });

  it("refuse la preuve qui désigne le compte courant", async () => {
    await link(SUB, 409);
  });

  it("refuse un corps sans jeton (forme)", async () => {
    await me().post("/me/identities").send({}).expect(400);
  });
});

describe("DELETE /me/identities/:provider", () => {
  it("retire la méthode désignée par son seul nom de connexion", async () => {
    await link(GOOGLE_SUB, 200);

    const response = await me().delete(`/me/identities/${GOOGLE_PROVIDER}`).expect(200);

    expect(jsonBody<LoginMethodsView>(response)).toEqual([
      { provider: "auth0", connection: null, isPrimary: true },
    ]);
    await ctx.drain();
    expect((await identityFacts()).map((fact) => fact.type)).toEqual([
      "user.identity_linked",
      "user.identity_revoked",
    ]);
  });

  it("refuse de retirer une méthode qui n'est pas rattachée", async () => {
    await me().delete(`/me/identities/${GOOGLE_PROVIDER}`).expect(409);
  });

  /** La principale porte le compte : elle ne se délie jamais (§9.6). */
  it("refuse de retirer la méthode principale", async () => {
    await me().delete("/me/identities/auth0").expect(409);
  });
});
