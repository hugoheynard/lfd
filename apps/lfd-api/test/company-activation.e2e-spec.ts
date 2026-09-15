/**
 * E2E du **verdict d'activation servi au client** —
 * plan `documentation/b2b/plan-mon-compte-a-completer.md` §2.1.
 *
 * Ce que seul le vrai SQL prouve : que la route relit la fiche par le même
 * lecteur que la porte d'activation (les codes rendus sont ceux que la base
 * justifie), et que le mur « membre » tient — une autre société répond 404 comme
 * une société inexistante.
 */
import type { ActivationGate } from "@lfd/contracts";

import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const MEMBER = "auth0|activation-member";

let ctx: E2eContext;
let companyId: string;
let otherCompanyId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  // Une société déposée : identité et détenteur présents, rien d'autre.
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.pending });
  companyId = company.id;
  await attachTo(ctx.prisma, member.id, companyId, CustomerRole.orders);
  otherCompanyId = (await createCompany(ctx.prisma, { status: CompanyStatus.pending })).id;
});

describe("GET /companies/:companyId/activation", () => {
  it("sert à un simple membre ce qui bloque sa société incomplète", async () => {
    const response = await ctx.asSub(MEMBER).get(`/companies/${companyId}/activation`).expect(200);

    const gate = jsonBody<ActivationGate>(response);
    expect(gate.canActivate).toBe(false);
    expect(gate.blocking).toEqual(["telephone", "vat", "facturation"]);
    expect(gate.checklist).toEqual([
      { piece: "vat", blocking: true, done: false },
      { piece: "kbis", blocking: false, done: false },
      { piece: "billing", blocking: true, done: false },
    ]);
  });

  it("répond 404 sur une société dont il n'est pas membre", async () => {
    await ctx.asSub(MEMBER).get(`/companies/${otherCompanyId}/activation`).expect(404);
  });

  it("répond 401 sans jeton", async () => {
    await ctx.http().get(`/companies/${companyId}/activation`).expect(401);
  });
});
