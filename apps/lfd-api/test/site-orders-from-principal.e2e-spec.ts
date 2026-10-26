/**
 * E2E des **commandes des sites vues et touchées par le compte principal**
 * (plan `documentation/comptes-client/plan-commandes-des-sites.md`, lot C1,
 * §7) — une frontière de sécurité : le mur tenant.
 *
 * Ce que seul l'e2e prouve : l'héritage `effective-role` est lu par les vraies
 * requêtes (rattachement au principal ACCEPTÉ, principal `active`, parent
 * ACTUEL), et par elles seules ; la passation et le devis restent fermés ; la
 * liste agrégée porte le mur dans son `where` ; le signalement et
 * l'annulation s'écrivent au nom du SITE, et l'annulation dit sa source.
 *
 * Sociétés, rattachements et commandes semés par Prisma (dette de
 * `test/factories.ts`) ; tous les gestes par HTTP. Aucune date absolue.
 */
import { randomUUID } from "node:crypto";

import {
  type CompanyOrderListItemView,
  type CreatedIdResponse,
  WORKSPACE_HEADER,
} from "@lfd/contracts";

import {
  CompanyStatus,
  CustomerRole,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { daysAgo, E2E_STAFF_SUB, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  bootCustomerScene,
  company,
  customer,
  customerCancel,
  member,
  seedCustomerOrder,
} from "./order-customer-cancel-scene.js";
import { cancelledMails, deliver, resetScene, scene } from "./order-staff-cancel-scene.js";
import { enableNotices } from "./sub-account-notice-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootCustomerScene();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene();
});

type Person = Awaited<ReturnType<typeof customer>>;

interface Group {
  readonly principal: string;
  readonly site: string;
  readonly sibling: string;
  /** Le `owner` du site, auteur des commandes du site. */
  readonly siteOwner: Person;
  readonly siblingOwner: Person;
}

/** Un principal, deux sites rattachés, un `owner` par site. */
async function group(): Promise<Group> {
  const principal = await company();
  const site = await company();
  const sibling = await company();
  await ctx.prisma.company.updateMany({
    where: { id: { in: [site, sibling] } },
    data: { parentCompanyId: principal },
  });
  const siteOwner = await customer();
  await member(siteOwner.id, site, { role: CustomerRole.owner });
  const siblingOwner = await customer();
  await member(siblingOwner.id, sibling, { role: CustomerRole.owner });
  return { principal, site, sibling, siteOwner, siblingOwner };
}

/** Un membre ACCEPTÉ du principal, au rôle donné. */
async function principalMember(g: Group, role: CustomerRole): Promise<Person> {
  const person = await customer();
  await member(person.id, g.principal, { role });
  return person;
}

/** Une commande de société, réglée au compte : visible dans « Mes commandes ». */
async function accountOrder(
  companyId: string,
  author: Person,
  over: { readonly status?: OrderStatus; readonly principal?: string | null } = {},
): Promise<string> {
  const { orderId } = await seedCustomerOrder({
    placedByUserId: author.id,
    companyId,
    payment: PaymentStatus.not_required,
    ...(over.status === undefined ? {} : { status: over.status }),
  });
  if (over.principal !== undefined) {
    await ctx.prisma.order.update({
      where: { id: orderId },
      data: { principalCompanyId: over.principal },
    });
  }
  return orderId;
}

const detail = (who: Person, orderId: string) => ctx.asSub(who.sub).get(`/orders/${orderId}`);
const sheet = (who: Person, orderId: string) => ctx.asSub(who.sub).get(`/orders/${orderId}/bon`);

async function list(
  who: Person,
  companyId: string,
  site?: string,
): Promise<readonly CompanyOrderListItemView[]> {
  const path =
    site === undefined
      ? `/companies/${companyId}/orders`
      : `/companies/${companyId}/orders?site=${site}`;
  return jsonBody<readonly CompanyOrderListItemView[]>(
    await ctx.asSub(who.sub).get(path).expect(200),
  );
}

const idsOf = (rows: readonly CompanyOrderListItemView[]) => rows.map((row) => row.id).sort();

describe("l'owner et l'admin du principal sur la commande d'un site (§7.1, §7.4)", () => {
  it.each([CustomerRole.owner, CustomerRole.admin])(
    "%s du principal : détail et bon (200)",
    async (role) => {
      const g = await group();
      const orderId = await accountOrder(g.site, g.siteOwner);
      const boss = await principalMember(g, role);

      await detail(boss, orderId).expect(200);
      await sheet(boss, orderId).expect(200);
    },
  );

  it.each([CustomerRole.orders, CustomerRole.billing])(
    "%s du principal : 404 sur la commande d'un site (§7.8)",
    async (role) => {
      const g = await group();
      const orderId = await accountOrder(g.site, g.siteOwner);
      const buyer = await principalMember(g, role);

      await detail(buyer, orderId).expect(404);
      await sheet(buyer, orderId).expect(404);
      await customerCancel(buyer.sub, orderId).expect(404);
    },
  );

  /**
   * §7.2 : une invitation au principal non acceptée n'ouvre rien sur les
   * sites. Une invitation VIVANTE est acceptée à la première requête
   * (`MembershipAcceptance.acceptLive`, cf. `order-customer-cancel.e2e-spec.ts`) :
   * par HTTP, le cas « non acceptée » est celui d'une invitation PÉRIMÉE.
   */
  it("invité du principal, jamais accepté (invitation périmée) : 404", async () => {
    const g = await group();
    const orderId = await accountOrder(g.site, g.siteOwner);
    const invited = await customer();
    await member(invited.id, await company()); // pour passer la porte d'entrée
    await ctx.prisma.membership.create({
      data: {
        userId: invited.id,
        companyId: g.principal,
        role: CustomerRole.owner,
        invitedAt: new Date(daysAgo(30)),
        acceptedAt: null,
      },
    });

    await detail(invited, orderId).expect(404);
    await customerCancel(invited.sub, orderId).expect(404);
  });

  it.each([CompanyStatus.suspended, CompanyStatus.terminated])(
    "principal %s : 404 sur la commande du site",
    async (status) => {
      const g = await group();
      const orderId = await accountOrder(g.site, g.siteOwner);
      const boss = await principalMember(g, CustomerRole.owner);
      await ctx.prisma.company.update({ where: { id: g.principal }, data: { status } });

      await detail(boss, orderId).expect(404);
    },
  );

  it("détacher coupe : le site détaché, la commande redevient introuvable (404)", async () => {
    const g = await group();
    const orderId = await accountOrder(g.site, g.siteOwner);
    const boss = await principalMember(g, CustomerRole.admin);
    await detail(boss, orderId).expect(200);

    await ctx.prisma.company.update({ where: { id: g.site }, data: { parentCompanyId: null } });

    await detail(boss, orderId).expect(404);
    expect(await list(boss, g.principal)).toEqual([]);
  });
});

describe("un site ne voit ni son principal ni ses frères", () => {
  it("le owner du site : 404 sur les commandes du principal et du site frère", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const principalOrder = await accountOrder(g.principal, boss);
    const siblingOrder = await accountOrder(g.sibling, g.siblingOwner);

    await detail(g.siteOwner, principalOrder).expect(404);
    await detail(g.siteOwner, siblingOrder).expect(404);
    await ctx.asSub(g.siteOwner.sub).get(`/companies/${g.principal}/orders`).expect(404);
  });

  it("la liste du site ne porte que ses commandes, sans site ni héritage", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const own = await accountOrder(g.site, g.siteOwner);
    await accountOrder(g.principal, boss);
    await accountOrder(g.sibling, g.siblingOwner);

    const rows = await list(g.siteOwner, g.site);

    expect(idsOf(rows)).toEqual([own]);
    expect(rows[0]).toMatchObject({ site: null, author: { kind: "customer", name: "Léa Petit" } });
  });
});

describe("la liste agrégée du principal (§2, §7.5, §7.6)", () => {
  it("owner : ses commandes ET celles de ses sites, chacune avec son site et son auteur", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const mine = await accountOrder(g.principal, boss);
    const ofSite = await accountOrder(g.site, g.siteOwner);
    const ofSibling = await accountOrder(g.sibling, g.siblingOwner);
    const byTeam = await accountOrder(g.site, g.siteOwner);
    await ctx.prisma.order.update({ where: { id: byTeam }, data: { placedByStaffId: "staff_1" } });
    // Une société étrangère, et une commande carte non réglée : jamais comptées.
    const stranger = await customer();
    const elsewhere = await company();
    await member(stranger.id, elsewhere);
    await accountOrder(elsewhere, stranger);
    await seedCustomerOrder({ placedByUserId: g.siteOwner.id, companyId: g.site });

    const rows = await list(boss, g.principal);

    expect(idsOf(rows)).toEqual([mine, ofSite, ofSibling, byTeam].sort());
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(mine)?.site).toBeNull();
    expect(byId.get(ofSite)?.site).toMatchObject({ companyId: g.site });
    expect(byId.get(ofSibling)?.site).toMatchObject({ companyId: g.sibling });
    expect(byId.get(ofSite)?.author).toEqual({ kind: "customer", name: "Léa Petit" });
    expect(byId.get(byTeam)?.author).toEqual({ kind: "team" });
  });

  it("le filtre `site` : un site du périmètre seulement ; hors périmètre, une liste vide", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.admin);
    await accountOrder(g.principal, boss);
    const ofSite = await accountOrder(g.site, g.siteOwner);
    await accountOrder(g.sibling, g.siblingOwner);
    const stranger = await customer();
    const elsewhere = await company();
    await member(stranger.id, elsewhere);
    await accountOrder(elsewhere, stranger);

    expect(idsOf(await list(boss, g.principal, g.site))).toEqual([ofSite]);
    expect(await list(boss, g.principal, elsewhere)).toEqual([]);
  });

  it.each([CustomerRole.orders, CustomerRole.billing])(
    "%s du principal : la liste reste celle du principal seul",
    async (role) => {
      const g = await group();
      const buyer = await principalMember(g, role);
      const mine = await accountOrder(g.principal, buyer);
      await accountOrder(g.site, g.siteOwner);

      expect(idsOf(await list(buyer, g.principal))).toEqual([mine]);
      expect(await list(buyer, g.principal, g.site)).toEqual([]);
    },
  );

  it("principal suspendu : ses commandes seulement, pas celles des sites", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const mine = await accountOrder(g.principal, boss);
    await accountOrder(g.site, g.siteOwner);
    await ctx.prisma.company.update({
      where: { id: g.principal },
      data: { status: CompanyStatus.suspended },
    });

    expect(idsOf(await list(boss, g.principal))).toEqual([mine]);
  });
});

/**
 * Ce bloc disait « commander pour un site reste fermé (§7.1, R8) » jusqu'au
 * 2026-10-23 : S6 l'ouvre (`plan-entrer-dans-ses-sites.md`, R1, R5) — une
 * commande passée depuis un site est la commande du site. Les deux tests
 * sont retournés, pas affaiblis : ils prouvent désormais l'ouverture.
 */
describe("commander pour un site, depuis le principal (S6, R5)", () => {
  it("le devis au nom d'un site par l'owner du principal : 200", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);

    await ctx
      .asSub(boss.sub)
      .post("/orders/quote")
      .send({ companyId: g.site, lines: [{ sku: "VIE-001", quantity: 6 }] })
      .expect(200);
  });

  /**
   * La passation prend sa société de l'espace de travail : depuis S6, un site
   * atteint par héritage DÉCLARÉ est servi (`resolveCompany`, R4) — la
   * commande est posée sur le site, pas sur le principal.
   */
  it("la passation en déclarant le site : la commande est posée sur le site", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    await member(boss.id, await company(), { role: CustomerRole.owner }); // deux espaces
    const pickup = await ctx.prisma.site.create({
      data: {
        label: "Labo",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "75002",
        ville: "Paris",
        pays: "France",
        isDefault: true,
      },
      select: { id: true },
    });

    await ctx
      .asSub(boss.sub)
      .post("/orders")
      .set(WORKSPACE_HEADER, g.site)
      .send({
        idempotencyKey: randomUUID(),
        salesTerms: null,
        pickupAddressId: pickup.id,
        requestedDeliveryDate: serviceDay(),
        fulfillmentMethod: "pickup",
        requestedWindow: { start: "07:00", end: "08:00" },
        note: "",
        lines: [{ sku: "VIE-001", quantity: 3 }],
      })
      .expect(201);

    expect(await ctx.prisma.order.count({ where: { companyId: g.site } })).toBe(1);
    expect(await ctx.prisma.order.count({ where: { companyId: g.principal } })).toBe(0);
  });
});

describe("l'annulation par le compte principal (§7.2, §7.7, §7.9)", () => {
  it("admin du principal : 204 ; le mail au site et le journal disent « du compte principal » ; l'auteur du geste n'est pas prévenu", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.admin);
    const colleague = await principalMember(g, CustomerRole.owner);
    await enableNotices(ctx, g.principal);
    const orderId = await accountOrder(g.site, g.siteOwner, { principal: g.principal });
    const principalName = (
      await ctx.prisma.company.findUniqueOrThrow({
        where: { id: g.principal },
        select: { enseigne: true },
      })
    ).enseigne;

    await customerCancel(boss.sub, orderId).expect(204);
    await deliver();

    expect(
      await ctx.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true, cancelledByUserId: true },
      }),
    ).toEqual({ status: OrderStatus.cancelled, cancelledByUserId: boss.id });

    const emailOf = async (person: Person) =>
      (await ctx.prisma.user.findUniqueOrThrow({ where: { id: person.id } })).email;
    const [mail] = cancelledMails();
    expect(mail?.to).toBe(await emailOf(g.siteOwner));
    expect(mail?.data).toMatchObject({
      author: { kind: "principal", name: "Léa P.", principal: principalName },
    });

    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "order.cancelled" },
      select: { payload: true },
    });
    expect(fact.payload).toMatchObject({
      cancelledFromPrincipal: { id: g.principal, name: principalName },
    });

    const notified = scene.mails
      .filter((sent) => sent.template === "customer.sub-account-activity")
      .map((sent) => sent.to);
    expect(notified).toContain(await emailOf(colleague));
    expect(notified).not.toContain(await emailOf(boss));
  });

  it("un membre du site garde son texte : pas de mention du principal", async () => {
    const g = await group();
    const orderId = await accountOrder(g.site, g.siteOwner);
    const colleague = await customer();
    await member(colleague.id, g.site);

    await customerCancel(colleague.sub, orderId).expect(204);
    await deliver();

    expect(cancelledMails()[0]?.data).toMatchObject({ author: { kind: "member" } });
  });

  /**
   * Disait « le lit, mais n'annule pas » jusqu'au 2026-10-23 : S6 ferme
   * l'héritage sur un site suspendu (R1, « site non suspendu »). Plus strict,
   * pas affaibli — et remonté à Hugo, la règle contredisant C1 §7.7.
   */
  it("site suspendu : l'owner du principal ne le lit plus, et n'annule pas (404)", async () => {
    const g = await group();
    const orderId = await accountOrder(g.site, g.siteOwner);
    const boss = await principalMember(g, CustomerRole.owner);
    await ctx.prisma.company.update({
      where: { id: g.site },
      data: { status: CompanyStatus.suspended },
    });

    await detail(boss, orderId).expect(404);
    await customerCancel(boss.sub, orderId).expect(404);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      OrderStatus.placed,
    );
  });
});

describe("le signalement par le compte principal (§7.3)", () => {
  it("owner du principal : la demande est enregistrée au nom du SITE, pas de l'espace de travail", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const orderId = await accountOrder(g.site, g.siteOwner, { status: OrderStatus.fulfilled });
    const reason = jsonBody<CreatedIdResponse>(
      await ctx
        .asSub(E2E_STAFF_SUB)
        .post("/admin/request-reasons")
        .send({
          kind: "order_problem",
          label: { fr: "Produit abîmé", en: "Damaged product", it: "" },
          recipientEmail: "sav@lfc.test",
          position: 0,
          active: true,
          audience: "both",
          priority: "urgent",
        })
        .expect(201),
    ).id;

    await ctx
      .asSub(boss.sub)
      .post(`/me/orders/${orderId}/problems`)
      .set(WORKSPACE_HEADER, g.principal)
      .field("reasonId", reason)
      .field("message", "Le pain était écrasé.")
      .expect(201);

    expect(
      await ctx.prisma.customerRequest.findFirstOrThrow({
        where: { orderId },
        select: { companyId: true, userId: true },
      }),
    ).toEqual({ companyId: g.site, userId: boss.id });
  });

  it("orders du principal : 404 sur la commande d'un site", async () => {
    const g = await group();
    const buyer = await principalMember(g, CustomerRole.orders);
    const orderId = await accountOrder(g.site, g.siteOwner, { status: OrderStatus.fulfilled });

    await ctx
      .asSub(buyer.sub)
      .post(`/me/orders/${orderId}/problems`)
      .field("reasonId", "r_absent")
      .field("message", "Le pain était écrasé.")
      .expect(404);
  });
});
