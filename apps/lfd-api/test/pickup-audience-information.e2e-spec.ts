/**
 * E2E de la règle « **chaque audience ne reçoit que son information** » (Hugo,
 * 2026-10-31 ; `documentation/promotions/plan-chaque-audience-son-information.md`,
 * § 5) sur les deux routes des points de la boutique.
 *
 * Trois remises distinctes au même point — une par acheteur type : pros
 * actifs, pros en cours d'inscription, particuliers. Chaque appel n'en reçoit
 * qu'une, et la réponse SÉRIALISÉE ne porte aucune clé par clientèle : c'est
 * le seul endroit où l'on voit ce qui part réellement dans le réseau.
 */
import type { AudiencePickupAddressView, CreatedPickupResponse } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { posePromotion, promotionTerms } from "./promotion-fixtures.js";

const ACTIVE = "auth0|audience-info-active";
const PENDING = "auth0|audience-info-pending";
const PERSO = "auth0|audience-info-perso";

const PRO_BP = 1_500;
const PENDING_BP = 1_200;
const INDIVIDUAL_BP = 500;

/** Une clé par clientèle, où qu'elle soit dans la réponse. */
const PER_CLIENTELE_KEY = /"(b2b|b2bPending|b2c|discounts|pickupAudiences)"\s*:/u;

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
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function personIn(sub: string, status: CompanyStatus | null): Promise<void> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub });
  if (status !== null) {
    const company = await createCompany(ctx.prisma, { status });
    await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  }
}

/** Un point ouvert aux deux clientèles, et une remise par acheteur type. */
async function seedPoint(): Promise<string> {
  const response = await staff()
    .post("/admin/pickup-addresses")
    .send({
      label: "Labo",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
    })
    .expect(201);
  const id = jsonBody<CreatedPickupResponse>(response).id;
  const audiences = [
    ["pros_active", PRO_BP],
    ["pros_pending", PENDING_BP],
    ["individuals", INDIVIDUAL_BP],
  ] as const;
  for (const [kind, bp] of audiences) {
    await posePromotion(
      staff(),
      promotionTerms({
        internalName: `Retrait · ${kind}`,
        label: { fr: "Remise de retrait", en: null, it: null },
        effect: { kind: "percent_off", value: bp },
        audiences: [{ kind, companyId: null }],
        fulfillment: { kind: "basket", pickup: { points: [id] }, delivery: "none" },
      }),
    );
  }
  return id;
}

interface Served {
  readonly raw: string;
  readonly points: readonly AudiencePickupAddressView[];
}

async function served(path: string, sub: string | null = null): Promise<Served> {
  const agent = sub === null ? ctx.http() : ctx.asSub(sub);
  const response = await agent.get(path).expect(200);
  return { raw: response.text, points: jsonBody<readonly AudiencePickupAddressView[]>(response) };
}

function onlyDiscount(answer: Served): unknown {
  expect(answer.points).toHaveLength(1);
  return answer.points[0]?.discount?.adjustment ?? null;
}

describe("GET /pickup-addresses — public, une audience déclarée", () => {
  /**
   * Régression : la route publique servait sur chaque point les remises des
   * trois clientèles (`discounts.b2b`, `b2bPending`, `b2c`) à n'importe quel
   * anonyme (corrigé le 2026-10-31).
   */
  it("un visiteur ne reçoit plus la remise des autres clientèles", async () => {
    await seedPoint();

    const answer = await served("/pickup-addresses");

    expect(answer.raw).not.toMatch(PER_CLIENTELE_KEY);
    expect(onlyDiscount(answer)).toEqual({ mode: "percent", bp: INDIVIDUAL_BP });
  });

  it("?audience=pro : la vitrine pro reçoit la remise des pros actifs, et elle seule", async () => {
    await seedPoint();

    const answer = await served("/pickup-addresses?audience=pro");

    expect(answer.raw).not.toMatch(PER_CLIENTELE_KEY);
    expect(onlyDiscount(answer)).toEqual({ mode: "percent", bp: PRO_BP });
  });

  it("?audience=pending est refusé (400) : une audience qui se déclare ne s'établit pas", async () => {
    await ctx.http().get("/pickup-addresses?audience=pending").expect(400);
    await ctx.http().get("/pickup-addresses?audience=b2bPending").expect(400);
  });
});

describe("GET /pickup-addresses/mine — l'audience établie", () => {
  it("un pro d'une société active reçoit la remise des pros", async () => {
    await seedPoint();
    await personIn(ACTIVE, CompanyStatus.active);

    const answer = await served("/pickup-addresses/mine", ACTIVE);

    expect(answer.raw).not.toMatch(PER_CLIENTELE_KEY);
    expect(onlyDiscount(answer)).toEqual({ mode: "percent", bp: PRO_BP });
  });

  it("une société en attente reçoit celle des pros en cours d'inscription", async () => {
    await seedPoint();
    await personIn(PENDING, CompanyStatus.pending);

    const answer = await served("/pickup-addresses/mine", PENDING);

    expect(answer.raw).not.toMatch(PER_CLIENTELE_KEY);
    expect(onlyDiscount(answer)).toEqual({ mode: "percent", bp: PENDING_BP });
  });

  it("un particulier inscrit reçoit celle des particuliers", async () => {
    await seedPoint();
    await personIn(PERSO, null);

    const answer = await served("/pickup-addresses/mine", PERSO);

    expect(answer.raw).not.toMatch(PER_CLIENTELE_KEY);
    expect(onlyDiscount(answer)).toEqual({ mode: "percent", bp: INDIVIDUAL_BP });
  });
});
