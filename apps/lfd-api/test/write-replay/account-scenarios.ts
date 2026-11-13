import { CompanyStatus } from "../../src/platform/database/client/client.js";
import { seedCompanyWithDelivery } from "../delivery-procedure-scene.js";
import { daysAgo, jsonBody, type E2eContext } from "../e2e-harness.js";
import { createCompany } from "../factories.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import {
  routeKey,
  STAFF,
  type ReplayFile,
  type ReplayRequest,
  type ScenarioSet,
} from "./scenario.js";
import { PDF, companyWithOwner } from "./seeds.js";

const HTTP = "lafoliecoffee/account/http";
const OWNER = "replay-owner";
const MEMBER = "replay-member";

const CONTACT = {
  firstName: "Karim",
  lastName: "Benali",
  fonction: "Responsable achats",
  email: "achats@replay.test",
  phone: "06 12 88 54 30",
  role: "orders",
};

/** Une ouverture par l'équipe sur la seule enseigne, avec son détenteur. */
export const COMPANY_WITHOUT_SIRET = {
  enseigne: "Café du Rejeu",
  primaryContact: {
    firstName: "Karim",
    lastName: "Benali",
    email: "titulaire@replay.test",
  },
};

const DELIVERY = {
  label: "Boutique",
  ligne1: "9 rue de la Roquette",
  ligne2: "",
  codePostal: "75011",
  ville: "Paris",
  pays: "France",
  isDefault: false,
  specs: {
    signatureRequired: false,
    note: "",
    slotList: { mode: "everyday", slots: [] },
    deliveryContact: null,
    gps: null,
  },
};

const KBIS: ReplayFile = {
  field: "file",
  content: PDF,
  filename: "kbis.pdf",
  contentType: "application/pdf",
};

/** Le chemin de la procédure d'une adresse, côté client ou côté staff. */
const procedureOf = (prefix: "" | "/admin", companyId: string, addressId: string): string =>
  `${prefix}/companies/${companyId}/delivery-addresses/${addressId}/procedure`;

/** Ajouter une étape à la procédure d'une adresse semée. */
async function addStepScenario(ctx: E2eContext, prefix: "" | "/admin"): Promise<ReplayRequest> {
  const { companyId, addressId } = await seedCompanyWithDelivery(ctx, OWNER, MEMBER);
  return {
    sub: prefix === "" ? OWNER : STAFF,
    path: `${procedureOf(prefix, companyId, addressId)}/steps`,
    fields: { title: "Portail" },
  };
}

/** Réviser une étape posée par la route. */
async function reviseStepScenario(ctx: E2eContext, prefix: "" | "/admin"): Promise<ReplayRequest> {
  const { companyId, addressId } = await seedCompanyWithDelivery(ctx, OWNER, MEMBER);
  const sub = prefix === "" ? OWNER : STAFF;
  const steps = `${procedureOf(prefix, companyId, addressId)}/steps`;
  const created = await ctx
    .asSub(sub)
    .post(steps)
    .set(INTENT_KEY, freshIntent())
    .field("title", "Portail")
    .expect(201);
  const stepId = jsonBody<{ id: string }>(created).id;
  return { sub, path: `${steps}/${stepId}`, fields: { title: "Portail vert" } };
}

/** Les comptes clients : contacts, adresses, KBIS, sous-comptes, procédures. */
export const ACCOUNT_SCENARIOS: ScenarioSet = {
  // Sans SIRET : rien d'autre que le scellement ne refuse une seconde société.
  [routeKey(`${HTTP}/admin-companies.controller.ts`, "create")]: () =>
    Promise.resolve({ sub: STAFF, path: "/admin/companies", body: COMPANY_WITHOUT_SIRET }),

  [routeKey(`${HTTP}/admin-company-contacts.controller.ts`, "add")]: async ({ ctx }) => {
    const company = await createCompany(ctx.prisma);
    return { sub: STAFF, path: `/admin/companies/${company.id}/contacts`, body: CONTACT };
  },

  [routeKey(`${HTTP}/company-contacts.controller.ts`, "addContact")]: async ({ ctx }) => {
    const { companyId } = await companyWithOwner(ctx, OWNER);
    return { sub: OWNER, path: `/companies/${companyId}/contacts`, body: CONTACT };
  },

  [routeKey(`${HTTP}/admin-company-pieces.controller.ts`, "addDelivery")]: async ({ ctx }) => {
    const company = await createCompany(ctx.prisma);
    return {
      sub: STAFF,
      path: `/admin/companies/${company.id}/delivery-addresses`,
      body: DELIVERY,
    };
  },

  [routeKey(`${HTTP}/company-addresses.controller.ts`, "addDelivery")]: async ({ ctx }) => {
    const { companyId } = await companyWithOwner(ctx, OWNER);
    return { sub: OWNER, path: `/companies/${companyId}/delivery-addresses`, body: DELIVERY };
  },

  [routeKey(`${HTTP}/admin-company-pieces.controller.ts`, "uploadKbis")]: async ({ ctx }) => {
    const company = await createCompany(ctx.prisma);
    return { sub: STAFF, path: `/admin/companies/${company.id}/kbis`, files: [KBIS] };
  },

  [routeKey(`${HTTP}/company-kbis.controller.ts`, "upload")]: async ({ ctx }) => {
    const { companyId } = await companyWithOwner(ctx, OWNER);
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { status: CompanyStatus.pending },
    });
    return { sub: OWNER, path: `/companies/${companyId}/kbis`, files: [KBIS] };
  },

  [routeKey(`${HTTP}/admin-company-pieces.controller.ts`, "certifyKbis")]: async ({ ctx }) => {
    const company = await createCompany(ctx.prisma);
    await ctx
      .asSub(STAFF)
      .put(`/admin/companies/${company.id}/kbis`)
      .set(INTENT_KEY, freshIntent())
      .attach("file", PDF, "kbis.pdf")
      .expect(204);
    return {
      sub: STAFF,
      path: `/admin/companies/${company.id}/kbis/certification`,
      body: { issuedOn: daysAgo(10).slice(0, 10) },
    };
  },

  [routeKey(`${HTTP}/admin-company-hierarchy.controller.ts`, "createSubAccount")]: async ({
    ctx,
  }) => {
    const group = await createCompany(ctx.prisma, { enseigne: "Alpes Chalets" });
    return {
      sub: STAFF,
      path: `/admin/companies/${group.id}/sub-accounts`,
      body: {
        enseigne: "Chalet Edelweiss",
        deliveryAddress: { ...DELIVERY, label: "Chalet", isDefault: true },
        follows: ["billing"],
      },
    };
  },

  [routeKey(`${HTTP}/company-delivery-procedure.controller.ts`, "addStep")]: ({ ctx }) =>
    addStepScenario(ctx, ""),
  [routeKey(`${HTTP}/admin-company-delivery-procedure.controller.ts`, "addStep")]: ({ ctx }) =>
    addStepScenario(ctx, "/admin"),
  [routeKey(`${HTTP}/company-delivery-procedure.controller.ts`, "reviseStep")]: ({ ctx }) =>
    reviseStepScenario(ctx, ""),
  [routeKey(`${HTTP}/admin-company-delivery-procedure.controller.ts`, "reviseStep")]: ({ ctx }) =>
    reviseStepScenario(ctx, "/admin"),
};
