/**
 * E2E de la **collecte des Core Web Vitals**.
 *
 * C'est la seule route publique d'OPS, et elle doit l'être : un visiteur de la
 * boutique n'a pas de jeton, et c'est justement son expérience qu'on mesure.
 * Cette suite éprouve ce qui rend cette ouverture acceptable — elle n'accepte
 * aucune donnée personnelle, elle n'écrit rien, et elle ne crée aucun nœud.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { VitalsStore } from "../src/ops/vitals/vitals.store.js";
import { bootstrapE2e, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";

const ROUTE = "/ops/vitals";

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

const post = (body: object) => ctx.http().post(ROUTE).send(body);

const lcpOf = (front: string): number | undefined =>
  ctx.app.get(VitalsStore).percentiles(front, Date.now()).get("LCP");

describe("la collecte accepte ce qu'il faut", () => {
  it("prend une mesure d'un navigateur ANONYME", async () => {
    // Une route réservée aux gens connectés ne mesurerait que le back-office —
    // c'est-à-dire personne dont l'expérience compte pour le chiffre d'affaires.
    await post({ samples: [{ front: "b2b-front", metric: "LCP", value: 1800 }] }).expect(204);

    expect(lcpOf("b2b-front")).toBe(1800);
  });
});

describe("ce qu'elle refuse, et sans le dire", () => {
  it("🔴 jette un front que la topologie ne déclare pas", async () => {
    // Le navigateur ne décide pas de ce qui figure sur la carte.
    await post({ samples: [{ front: "inventé", metric: "LCP", value: 100 }] }).expect(204);

    expect(lcpOf("inventé")).toBeUndefined();
  });

  it("jette une charge malformée sans rendre 400", async () => {
    // Un 400 apprendrait surtout à quelqu'un ce qui passe. Une charge illisible
    // n'est pas une erreur à signaler à un anonyme, c'est une mesure qu'on
    // n'aura pas.
    await post({ samples: "pas un tableau" }).expect(204);
    await post({}).expect(204);
    await post({ samples: [{ front: "b2b-admin-front", metric: "INVENTÉE", value: 1 }] }).expect(
      204,
    );

    expect(lcpOf("b2b-admin-front")).toBeUndefined();
  });

  it("🔴 ne se laisse pas inonder par une seule requête", async () => {
    // Cinquante mesures dans un corps : on en garde douze. Sans borne, une
    // seule requête remplirait la file en mémoire.
    const samples = Array.from({ length: 50 }, () => ({
      front: "b2b-front",
      metric: "CLS",
      value: 0.02,
    }));

    await post({ samples }).expect(204);

    expect(ctx.app.get(VitalsStore).percentiles("b2b-front", Date.now()).get("CLS")).toBe(0.02);
  });
});
