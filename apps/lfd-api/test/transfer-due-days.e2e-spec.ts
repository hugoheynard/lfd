/**
 * E2E de **l'échéance des factures au virement** (V6,
 * `documentation/comptabilite/le-paiement-par-virement.md`).
 *
 * Ce que seul le vrai serveur prouve : la colonne naît à 15 (défaut de la
 * migration et de la déclaration), s'écrit et se relit par la vue de
 * l'entité, un refus de borne traverse le filtre en 400 en nommant le
 * réglage, et le fait tombe au journal une fois — une saisie rejouée n'écrit
 * rien.
 *
 * Aucune date : rien ici ne lit l'horloge.
 */
import type { LegalEntityView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const BASE = "/admin/accounting/legal-entities";
const FACT = "legal_entity.transfer_due_days_changed";

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
    .set(INTENT_KEY, freshIntent())
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
      rcs: "Chambéry B 552 100 554",
      shareCapitalCents: 1_000_000,
      vatNumber: "FR40552100554",
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

function put(id: string, days: unknown): ReturnType<ReturnType<E2eContext["asSub"]>["put"]> {
  return staff()
    .put(`${BASE}/${id}/transfer-due-days`)
    .set(INTENT_KEY, freshIntent())
    .send({ days });
}

describe("l'échéance des factures au virement, réglage de l'entité", () => {
  it("naît à 15 jours après l'émission", async () => {
    const id = await declare();

    expect((await read(id)).transferDueDaysAfterIssue).toBe(15);
  });

  it("s'écrit, se relit, et journalise l'après une seule fois", async () => {
    const id = await declare();

    await put(id, 30).expect(204);
    await put(id, 30).expect(204);

    expect((await read(id)).transferDueDaysAfterIssue).toBe(30);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: id, type: FACT },
      select: { payload: true },
    });
    expect(facts).toEqual([{ payload: { subjectLabel: "La Folie Douce", days: 30 } }]);
  });

  it("refuse en 400 46 jours, en nommant le réglage, sans rien écrire", async () => {
    const id = await declare();

    const response = await put(id, 46).expect(400);

    expect(response.text).toContain("Échéance des factures au virement");
    expect((await read(id)).transferDueDaysAfterIssue).toBe(15);
  });

  it("refuse en 400 un délai qui n'est pas un entier", async () => {
    const id = await declare();

    await put(id, "15").expect(400);
    await put(id, 1.5).expect(400);
  });
});
