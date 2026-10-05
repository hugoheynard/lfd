import { randomUUID } from "node:crypto";
/**
 * E2E du lot **S4 — le payeur des sous-comptes** (plan
 * `documentation/b2b/comptes-client/plan-sous-comptes.md`, §2.1 ter, §2.1
 * quater, §2.3, §2.4, §3).
 *
 * Ce que seul le vrai SQL prouve : la passation copie le payeur résolu dans
 * `orders.billed_company_id` et lit les termes du payeur ; le lot groupe par
 * mandat effectif selon la forme datée du site ; détacher révoque les mandats
 * du site au nom du principal, dans la transaction du geste ; les routes
 * client d'un site ne rendent ni l'IBAN ni le mandat du principal.
 *
 * ⚠️ Sociétés, suivis, mandats actifs et commandes du lot écrits par Prisma :
 * même dette que `collection-batches.e2e-spec.ts` (un mandat actif exige une
 * pièce et une signature qu'aucun e2e n'a à rejouer ici). Les passations, la
 * forme de prélèvement, le détachement et les lectures passent par HTTP.
 *
 * Aucune date absolue : la clôture est le dernier 1er du mois atteint,
 * calculé par le domaine depuis l'instant présent.
 */
import type {
  AdminCompanyFicheView,
  ClientSheet,
  CollectionCycleView,
  ConstitutedBatchesView,
  CustomerBankAccountSectionView,
  CustomerBilledToView,
  DetachedUnpaidOrdersView,
} from "@lfd/contracts";

import { cycleToConstitute } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, daysAgo, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const SERVICE_DAY = serviceDay();
const DAY_MS = 24 * 60 * 60 * 1000;
const PRINCIPAL_NAME = "SAS Alpes Chalets";
const PRINCIPAL_IBAN = "FR7630004000031234567890143";
const SITE_IBAN = "FR1420041010050500013M02606";
const COLLECTION = "/admin/accounting/collection";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let intents = 0;
const fakeGateway = {
  createIntent: () => {
    intents += 1;
    return Promise.resolve({
      paymentIntentId: `pi_s4_${String(intents)}`,
      clientSecret: `pi_s4_${String(intents)}_secret`,
    });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;
let seq = 0;
let closesAt: Date;
/** Le point de retrait semé par le test courant. */
let pickupId = "pickup_absent";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: PaymentGateway, value: fakeGateway },
      { token: AdminTokenVerifier, value: stubAdminVerifier },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  closesAt = cycleToConstitute(new Date(daysAgo(0)), null).closesAt;
  // `ctx.reset()` vide aussi le plancher (T55) : la suite le repose.
  await ctx.prisma.collectionFloor.create({
    data: { id: true, floorAt: new Date(closesAt.getTime() - 30 * DAY_MS) },
  });
  const point = await ctx.prisma.pickupAddress.create({
    select: { id: true },
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
  });
  pickupId = point.id;
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

interface Group {
  readonly principal: string;
  readonly site: string;
  /** Le `sub` de la gouvernante, `owner` du site — et de lui seul. */
  readonly housekeeper: string;
  /** Le `sub` du détenteur du principal. */
  readonly owner: string;
}

/**
 * Un principal au terme mensuel, son RIB, et un site sans terme qui le suit en
 * `billing` depuis trente jours avant la clôture.
 */
async function group(): Promise<Group> {
  seq += 1;
  const principal = (await createCompany(ctx.prisma, { raisonSociale: PRINCIPAL_NAME })).id;
  await ctx.prisma.company.update({
    where: { id: principal },
    data: { grantedTerms: ["monthly"] },
  });
  const site = (
    await createCompany(ctx.prisma, { raisonSociale: "", enseigne: `Chalet ${String(seq)}` })
  ).id;
  await ctx.prisma.company.update({ where: { id: site }, data: { parentCompanyId: principal } });
  await ctx.prisma.companyFollow.create({
    data: {
      companyId: site,
      parentId: principal,
      aspect: "billing",
      validFrom: new Date(closesAt.getTime() - 30 * DAY_MS),
    },
  });
  const housekeeper = `auth0|gouvernante-${String(seq)}`;
  const owner = `auth0|detenteur-${String(seq)}`;
  const hk = await createUser(ctx.prisma, { auth0Sub: housekeeper });
  await attachTo(ctx.prisma, hk.id, site, CustomerRole.owner);
  const po = await createUser(ctx.prisma, { auth0Sub: owner });
  await attachTo(ctx.prisma, po.id, principal, CustomerRole.owner);
  await rib(principal, PRINCIPAL_IBAN);
  return { principal, site, housekeeper, owner };
}

async function rib(companyId: string, iban: string): Promise<string> {
  await staff()
    .put(`/admin/companies/${companyId}/bank-account`)
    .send({
      iban,
      bic: "BNPAFRPP",
      holder: PRINCIPAL_NAME,
      holderLegalForm: "SAS",
      line1: "1 route des Chalets",
      line2: "",
      postalCode: "73150",
      city: "Val d'Isère",
      countryCode: "FR",
    })
    .expect(204);
  const account = await ctx.prisma.companyBankAccount.findUniqueOrThrow({
    where: { companyId },
    select: { id: true },
  });
  return account.id;
}

async function collectingEntity(): Promise<string> {
  const response = await staff()
    .post("/admin/accounting/legal-entities")
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
      rcs: "Chambéry B 552 100 554",
      shareCapitalCents: 1_000_000,
      vatNumber: "FR89552100554",
      address: {
        line1: "12 rue du Fournil",
        line2: "",
        postalCode: "73000",
        city: "Chambéry",
        countryCode: "FR",
      },
    })
    .expect(201);
  const id = jsonBody<{ id: string }>(response).id;
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
    .send({ ics: "FR72ZZZ123456" })
    .expect(204);
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
    .send({
      iban: "FR1420041010050500013M02606",
      bic: "CEPAFRPP751",
      holder: "Crazeativity",
      line1: "Route de la Balme",
      line2: "",
      postalCode: "73150",
      city: "Val d'Isère",
      countryCode: "FR",
    })
    .expect(204);
  return id;
}

/** Un mandat actif porté par `companyId`, au nom de `debtorId`, sur ce compte. */
async function activeMandate(
  entityId: string,
  companyId: string,
  debtorId: string,
  bankAccountId: string,
): Promise<string> {
  seq += 1;
  const mandate = await ctx.prisma.paymentMandate.create({
    data: {
      companyId,
      creditorId: entityId,
      reference: `RUM-S4-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(closesAt.getTime() - 60 * DAY_MS),
      scheme: "B2B",
      paymentType: "recurrent",
      bankAccountId,
      debtorCompanyId: debtorId,
      debtorSiren: "552100554",
      debtorName: PRINCIPAL_NAME,
      debtorLegalForm: "SAS",
    },
  });
  return mandate.id;
}

/** Une commande du site passée au compte du principal, deux jours avant la clôture. */
async function billedOrder(site: string, payer: string): Promise<string> {
  seq += 1;
  const user = await createUser(ctx.prisma, { auth0Sub: `s4-${String(seq)}` });
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-S4-${String(seq)}`,
      companyId: site,
      billedCompanyId: payer,
      placedByUserId: user.id,
      subtotalCents: 10_000,
      totalCents: 10_550,
      vatCents: 550,
      paymentStatus: "not_required",
      createdAt: new Date(closesAt.getTime() - 2 * DAY_MS),
    },
    select: { id: true },
  });
  return order.id;
}

async function constitute(entityId: string): Promise<readonly string[]> {
  const response = await staff()
    .post(`${COLLECTION}/batches`)
    .send({ legalEntityId: entityId })
    .expect(201);
  return jsonBody<ConstitutedBatchesView>(response).batchIds;
}

async function cycleOf(entityId: string): Promise<CollectionCycleView> {
  return jsonBody<CollectionCycleView>(
    await staff().get(`${COLLECTION}/cycle?legalEntityId=${entityId}`).expect(200),
  );
}

function placeOrder(sub: string, settlement: "account" | "card" | null) {
  return ctx
    .asSub(sub)
    .post("/orders")
    .send({
      idempotencyKey: randomUUID(),
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "pickup",
      pickupAddressId: pickupId,
      settlement,
      note: "",
      lines: [{ sku: "VIE-001", quantity: 2 }],
    });
}

describe("la passation d'un site (§2.3, §2.4)", () => {
  it("copie le principal comme payeur, et commande au compte sur SES termes", async () => {
    const g = await group();

    const placed = await placeOrder(g.housekeeper, "account").expect(201);

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: jsonBody<{ id: string }>(placed).id },
      select: { companyId: true, billedCompanyId: true, paymentStatus: true },
    });
    expect(order).toEqual({
      companyId: g.site,
      billedCompanyId: g.principal,
      paymentStatus: "not_required",
    });
  });

  it("refuse un site dont le principal est suspendu, en nommant le principal (Q4)", async () => {
    const g = await group();
    await ctx.prisma.company.update({ where: { id: g.principal }, data: { status: "suspended" } });

    const refused = await placeOrder(g.housekeeper, "card").expect(409);

    expect(refused.text).toContain(PRINCIPAL_NAME);
    expect(await ctx.prisma.order.count({ where: { companyId: g.site } })).toBe(0);
  });

  it("refuse une commande au nom d'un compte de groupe sans livraison", async () => {
    const g = await group();
    await ctx.prisma.company.update({
      where: { id: g.principal },
      data: { groupWithoutDelivery: true },
    });

    const refused = await placeOrder(g.owner, "card").expect(409);

    expect(refused.text).toContain("compte de groupe");
  });

  it("le bon du site nomme le principal, le payeur copié (mention légale)", async () => {
    const g = await group();
    const placed = await placeOrder(g.housekeeper, "account").expect(201);
    const orderId = jsonBody<{ id: string }>(placed).id;

    const sheet = jsonBody<ClientSheet>(
      await ctx.asSub(g.housekeeper).get(`/orders/${orderId}/bon`).expect(200),
    );

    expect(sheet.customer.legalName).toBe(PRINCIPAL_NAME);
    expect(sheet.customer.tradeName).toMatch(/^Chalet /u);
  });
});

describe("le lot d'un principal et de ses sites (§2.1 ter)", () => {
  it("forme 2 — mandat du site sur le RIB du principal : une ligne PAR SITE", async () => {
    const entity = await collectingEntity();
    const g = await group();
    const second = (await createCompany(ctx.prisma, { raisonSociale: "", enseigne: "Chalet B" }))
      .id;
    await ctx.prisma.company.update({
      where: { id: second },
      data: { parentCompanyId: g.principal },
    });
    await ctx.prisma.companyFollow.create({
      data: {
        companyId: second,
        parentId: g.principal,
        aspect: "billing",
        validFrom: new Date(closesAt.getTime() - 30 * DAY_MS),
      },
    });
    const account = await ctx.prisma.companyBankAccount.findUniqueOrThrow({
      where: { companyId: g.principal },
      select: { id: true },
    });
    await activeMandate(entity, g.principal, g.principal, account.id);
    for (const site of [g.site, second]) {
      await activeMandate(entity, site, g.principal, account.id);
      await staff()
        .put(`/admin/companies/${site}/collection-form`)
        .send({ form: "own_mandate_principal_iban" })
        .expect(204);
      // La forme vaut à la CLÔTURE : on la date d'avant, comme une décision du cycle.
      await ctx.prisma.companyCollectionForm.updateMany({
        where: { companyId: site },
        data: { validFrom: new Date(closesAt.getTime() - 10 * DAY_MS) },
      });
      await billedOrder(site, g.principal);
    }

    await constitute(entity);

    const [batch] = (await cycleOf(entity)).batches;
    expect(batch).toMatchObject({ lineCount: 2, orderCount: 2 });
  });

  it("forme 3 — RIB propre : le fichier débite l'IBAN du site", async () => {
    const entity = await collectingEntity();
    const g = await group();
    const siteAccount = await rib(g.site, SITE_IBAN);
    await activeMandate(entity, g.site, g.principal, siteAccount);
    await ctx.prisma.companyCollectionForm.create({
      data: {
        companyId: g.site,
        form: "own_iban",
        validFrom: new Date(closesAt.getTime() - 10 * DAY_MS),
      },
    });
    await billedOrder(g.site, g.principal);

    const [batchId] = await constitute(entity);
    const file = await staff()
      .get(`${COLLECTION}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);

    expect(file.text).toContain(SITE_IBAN);
    expect(file.text).not.toContain(PRINCIPAL_IBAN);
    expect(file.text).toContain(PRINCIPAL_NAME);
  });

  it("forme 3 sans mandat de site : le lot n'est pas déposable et nomme le site, jamais le principal débité", async () => {
    const entity = await collectingEntity();
    const g = await group();
    await rib(g.site, SITE_IBAN);
    const principalAccount = await ctx.prisma.companyBankAccount.findUniqueOrThrow({
      where: { companyId: g.principal },
      select: { id: true },
    });
    await activeMandate(entity, g.principal, g.principal, principalAccount.id);
    await ctx.prisma.company.update({
      where: { id: g.site },
      data: { raisonSociale: "Chalet Seul" },
    });
    await ctx.prisma.companyCollectionForm.create({
      data: {
        companyId: g.site,
        form: "own_iban",
        validFrom: new Date(closesAt.getTime() - 10 * DAY_MS),
      },
    });
    const orderId = await billedOrder(g.site, g.principal);

    await staff().post(`${COLLECTION}/batches`).send({ legalEntityId: entity });

    const view = await cycleOf(entity);
    // Le site est nommé, pas le principal : c'est son mandat qui manque.
    expect(view.exclusions).toMatchObject([
      { orderId, reason: "no_mandate", companyName: "Chalet Seul" },
    ]);
    expect(view.batches.every((batch) => batch.orderCount === 0 || !batch.depositable)).toBe(true);
    const lines = await ctx.prisma.collectionBatchLine.count();
    expect(lines).toBe(0);
  });

  it("la fiche relit la forme en vigueur : `null` avant, posée ensuite, et jamais sur le principal", async () => {
    const g = await group();
    const fiche = async (id: string) =>
      jsonBody<AdminCompanyFicheView>(await staff().get(`/admin/companies/${id}`).expect(200))
        .hierarchy;

    expect((await fiche(g.site)).collectionForm).toBeNull();
    await staff()
      .put(`/admin/companies/${g.site}/collection-form`)
      .send({ form: "own_iban" })
      .expect(204);

    expect((await fiche(g.site)).collectionForm).toMatchObject({ form: "own_iban" });
    expect((await fiche(g.principal)).collectionForm).toBeNull();
  });

  it("refuse une forme de prélèvement pour une société qui paie seule", async () => {
    const lone = (await createCompany(ctx.prisma)).id;

    await staff()
      .put(`/admin/companies/${lone}/collection-form`)
      .send({ form: "own_iban" })
      .expect(409);
  });
});

describe("détacher un site (§2.1 ter, §2.1 quater)", () => {
  it("révoque ses mandats au nom du principal, et ses commandes restent à régler à la main", async () => {
    const entity = await collectingEntity();
    const g = await group();
    const account = await ctx.prisma.companyBankAccount.findUniqueOrThrow({
      where: { companyId: g.principal },
      select: { id: true },
    });
    await activeMandate(entity, g.principal, g.principal, account.id);
    const siteMandate = await activeMandate(entity, g.site, g.principal, account.id);
    const orderId = await billedOrder(g.site, g.principal);

    await staff().post(`/admin/companies/${g.site}/parent/detach`).expect(204);
    const revoked = await ctx.prisma.paymentMandate.findUniqueOrThrow({
      where: { id: siteMandate },
      select: { status: true, revokedAt: true },
    });
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).not.toBeNull();

    await constitute(entity);
    expect((await cycleOf(entity)).exclusions).toMatchObject([
      { orderId, reason: "payer_detached" },
    ]);

    const admin = jsonBody<DetachedUnpaidOrdersView>(
      await staff().get(`/admin/accounting/detached-unpaid/companies/${g.principal}`).expect(200),
    );
    expect(admin.orders).toMatchObject([
      { orderId, site: { id: g.site }, payer: { id: g.principal } },
    ]);
    const client = jsonBody<DetachedUnpaidOrdersView>(
      await ctx.asSub(g.owner).get(`/companies/${g.principal}/detached-unpaid-orders`).expect(200),
    );
    expect(client.orders.map((order) => order.orderId)).toEqual([orderId]);
  });

  it("le mur client des impayés : un non-membre ne lit rien (404)", async () => {
    const g = await group();

    await ctx
      .asSub(g.housekeeper)
      .get(`/companies/${g.principal}/detached-unpaid-orders`)
      .expect(404);
  });
});

describe("les routes client d'un site (§3)", () => {
  it("ne rendent ni l'IBAN ni le mandat du principal — seulement « Facturé à »", async () => {
    const entity = await collectingEntity();
    const g = await group();
    const account = await ctx.prisma.companyBankAccount.findUniqueOrThrow({
      where: { companyId: g.principal },
      select: { id: true },
    });
    await activeMandate(entity, g.principal, g.principal, account.id);
    await staff().put("/admin/feature-access/customerMandate").send({ value: "open" }).expect(204);
    const site = ctx.asSub(g.housekeeper);

    const bank = jsonBody<CustomerBankAccountSectionView>(
      await site.get(`/companies/${g.site}/bank-account`).expect(200),
    );
    const mandate = await ctx.asSub(g.housekeeper).get(`/companies/${g.site}/mandate`).expect(200);
    const billedTo = jsonBody<CustomerBilledToView>(
      await ctx.asSub(g.housekeeper).get(`/companies/${g.site}/billed-to`).expect(200),
    );

    expect(bank.account).toBeNull();
    expect(mandate.body).toBeNull();
    expect(billedTo).toEqual({ billedTo: { name: PRINCIPAL_NAME } });
    expect(JSON.stringify(billedTo)).not.toContain(g.principal);
  });

  it("refusent de frapper ou d'imprimer depuis le site un mandat sur l'IBAN du principal", async () => {
    await collectingEntity();
    const g = await group();
    await staff().put("/admin/feature-access/customerMandate").send({ value: "open" }).expect(204);

    const refused = await ctx.asSub(g.housekeeper).post(`/companies/${g.site}/mandate`).expect(409);
    await ctx.asSub(g.housekeeper).get(`/companies/${g.site}/mandate/document.pdf`).expect(409);

    expect(refused.text).toContain(PRINCIPAL_NAME);
    expect(await ctx.prisma.paymentMandate.count({ where: { companyId: g.site } })).toBe(0);
  });
});

describe("la frappe staff d'un mandat de site (T9)", () => {
  it("fige le principal comme débiteur et son compte, malgré un site sans SIREN", async () => {
    await collectingEntity();
    const g = await group();
    await ctx.prisma.company.update({ where: { id: g.site }, data: { siren: "", siret: "" } });
    const account = await ctx.prisma.companyBankAccount.findUniqueOrThrow({
      where: { companyId: g.principal },
      select: { id: true },
    });

    await staff().post(`/admin/companies/${g.site}/mandate`).expect(201);

    const minted = await ctx.prisma.paymentMandate.findFirstOrThrow({
      where: { companyId: g.site },
      select: {
        status: true,
        bankAccountId: true,
        debtorCompanyId: true,
        debtorName: true,
        debtorSiren: true,
      },
    });
    expect(minted).toMatchObject({
      status: "draft",
      bankAccountId: account.id,
      debtorCompanyId: g.principal,
      debtorName: PRINCIPAL_NAME,
    });
    expect(minted.debtorSiren).not.toBe("");
  });
});
