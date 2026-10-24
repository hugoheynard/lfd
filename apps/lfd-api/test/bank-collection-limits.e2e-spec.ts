/**
 * E2E des **plafonds de la banque** de l'entité émettrice (plan
 * `documentation/comptabilite/prelevement/plan-plafonds-de-la-banque.md`, PL1).
 *
 * Ce que seul le vrai serveur prouve : la table par schéma s'écrit et se
 * relit par la fiche (une ligne oubliée par le dépôt rendrait « enregistré »
 * puis le vide), un montant mal formé traverse le filtre en 400, le CHECK
 * `> 0` tient en base, et le fait tombe au journal.
 */
import type { LegalEntityView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

const BASE = "/admin/accounting/legal-entities";
const NONE = { perDebitCents: null, perRemittanceCents: null, monthlyCents: null };

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
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

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

async function declare(): Promise<string> {
  const response = await staff()
    .post(BASE)
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
      rcs: "",
      shareCapitalCents: 1_000_000,
      vatNumber: "",
      address: {
        line1: "12 rue du Fournil",
        line2: "",
        postalCode: "73000",
        city: "Chambéry",
        countryCode: "FR",
      },
    })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

async function read(id: string): Promise<LegalEntityView> {
  return jsonBody<LegalEntityView>(await staff().get(`${BASE}/${id}`).expect(200));
}

describe("les plafonds de la banque", () => {
  it("partent non renseignés, pour les deux schémas", async () => {
    const id = await declare();

    expect((await read(id)).bankCollectionLimits).toEqual({ CORE: NONE, B2B: NONE });
  });

  it("s'écrivent par schéma, se relisent, et journalisent l'après", async () => {
    const id = await declare();

    await staff()
      .put(`${BASE}/${id}/bank-collection-limits`)
      .send({
        scheme: "B2B",
        perDebitCents: 500_000,
        perRemittanceCents: null,
        monthlyCents: 9_000_000,
      })
      .expect(204);

    expect((await read(id)).bankCollectionLimits).toEqual({
      CORE: NONE,
      B2B: { perDebitCents: 500_000, perRemittanceCents: null, monthlyCents: 9_000_000 },
    });
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: id, type: "legal_entity.bank_collection_limits_set" },
      select: { payload: true },
    });
    expect(facts).toEqual([
      {
        payload: {
          subjectLabel: "La Folie Douce",
          scheme: "B2B",
          perDebitCents: 500_000,
          perRemittanceCents: null,
          monthlyCents: 9_000_000,
        },
      },
    ]);
  });

  it("s'effacent par une écriture : un plafond remis à vide se relit vide", async () => {
    const id = await declare();
    const path = `${BASE}/${id}/bank-collection-limits`;
    await staff()
      .put(path)
      .send({ scheme: "B2B", ...NONE, monthlyCents: 100 })
      .expect(204);

    await staff()
      .put(path)
      .send({ scheme: "B2B", ...NONE })
      .expect(204);

    expect((await read(id)).bankCollectionLimits.B2B).toEqual(NONE);
  });

  it("refuse en 400 un plafond nul ou négatif, en le nommant, sans rien écrire", async () => {
    const id = await declare();

    const response = await staff()
      .put(`${BASE}/${id}/bank-collection-limits`)
      .send({ scheme: "B2B", ...NONE, perRemittanceCents: -5 })
      .expect(400);

    expect(response.text).toContain("Plafond par remise");
    expect((await read(id)).bankCollectionLimits.B2B).toEqual(NONE);
  });

  it("refuse en 400 un montant non entier, et un schéma inconnu", async () => {
    const id = await declare();
    const path = `${BASE}/${id}/bank-collection-limits`;

    await staff()
      .put(path)
      .send({ scheme: "B2B", ...NONE, monthlyCents: 12.5 })
      .expect(400);
    await staff()
      .put(path)
      .send({ scheme: "COR1", ...NONE })
      .expect(400);
  });

  it("refuse en 404 une entité inconnue", async () => {
    await staff()
      .put(`${BASE}/absente/bank-collection-limits`)
      .send({ scheme: "B2B", ...NONE })
      .expect(404);
  });

  it("la base refuse elle-même un plafond ≤ 0 (CHECK)", async () => {
    const id = await declare();

    await expect(
      ctx.prisma.$executeRawUnsafe(
        `INSERT INTO "public"."legal_entity_bank_limits" (legal_entity_id, scheme, monthly_cents, updated_at)
         VALUES ($1, 'B2B', 0, CURRENT_TIMESTAMP)`,
        id,
      ),
    ).rejects.toThrow(/legal_entity_bank_limits_monthly_positive/u);
  });
});
