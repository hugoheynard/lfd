/**
 * E2E de **la demande de paiement libre par la porte** (plan
 * `documentation/payment/liens-de-paiement/plan-le-lien-vers-un-sujet.md`,
 * §5, lot F1) : un lien libre créé au back-office se paie par la page
 * `/payer/…` du bloc `payment`, sujet `free_charge`.
 *
 * Ce que seul le vrai SQL prouve :
 * - la création écrit la demande de paiement libre (sans session ni URL Stripe, sous le
 *   `CHECK` de la paire) et son lien dans UNE transaction ; le scellé
 *   d'intention ne garde pas l'adresse, qui porte le jeton ;
 * - le paiement traverse la porte, le webhook des cartes et le sujet ;
 * - l'annulation révoque le lien (la page rend 404) et son abonné durable
 *   annule l'intention ; une annulation qui croise l'ouverture de la page
 *   est tranchée sous le verrou de la ligne ;
 * - payé après annulation : l'argent est gardé, la cloche sonne une fois.
 *
 * Frontières doublées : la signature du jeton staff, le prestataire de carte,
 * et la racine publique de l'origine.
 */
import type { CreatedPaymentLink, PayLinkIntent, PaymentLinkView } from "@lfd/contracts";

import { FixedOrigins } from "../src/payment/link/application/__tests__/pay-link-doubles.js";
import { PayLinkOrigins } from "../src/payment/link/domain/ports/pay-link-origins.js";
import { CardProviders } from "../src/payment/card/domain/ports/card-providers.js";
import type { CreateIntentParams } from "../src/payment/card/domain/ports/card-provider-types.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { cardPaid, E2eCardProvider, E2eCardProviders, recordCardEvent } from "./card-payments.js";
import { createCompany } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const ROOT = "https://app.lfc.test";
const LINKS = "/admin/accounting/payment-links";
const VIEW = "/pay-links/view";
const INTENT = "/pay-links/intent";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

/** Le prestataire doublé, avec un geste joué AVANT la création d'une intention. */
class RacingProvider extends E2eCardProvider {
  beforeIntent: (() => Promise<void>) | null = null;

  override async createIntent(params: CreateIntentParams) {
    const hook = this.beforeIntent;
    this.beforeIntent = null;
    await hook?.();
    return super.createIntent(params);
  }
}

class RacingProviders extends E2eCardProviders {
  override readonly provider = new RacingProvider("pi_fc");
}

const cards = new RacingProviders("pi_fc");

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CardProviders, value: cards },
      {
        token: PayLinkOrigins,
        value: new FixedOrigins([
          { name: "lafoliecoffee", label: "La Folie Coffee", publicRoot: ROOT },
        ]),
      },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  cards.provider.cancellation = { kind: "cancelled" };
  cards.provider.beforeIntent = null;
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(E2E_STAFF_SUB);
}

async function create(key = freshIntent()): Promise<CreatedPaymentLink> {
  const { id: companyId } = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  return send(companyId, key);
}

async function send(companyId: string, key: string): Promise<CreatedPaymentLink> {
  return jsonBody<CreatedPaymentLink>(
    await staff()
      .post(LINKS)
      .set(INTENT_KEY, key)
      .send({ companyId, amountCents: 12_000, label: "Régularisation août" })
      .expect(201),
  );
}

function tokenOf(url: string): string {
  return url.slice(`${ROOT}/payer/`.length);
}

async function list(): Promise<PaymentLinkView[]> {
  return jsonBody<PaymentLinkView[]>(await staff().get(LINKS).expect(200));
}

/** Ouvre la page et crée l'intention ; rend la référence chez le prestataire. */
async function startPaying(url: string): Promise<string> {
  const before = cards.provider.issued.length;
  const intent = jsonBody<PayLinkIntent>(
    await ctx
      .http()
      .post(INTENT)
      .send({ token: tokenOf(url) })
      .expect(200),
  );
  expect(intent.amountCents).toBe(12_000);
  expect(cards.provider.issued).toHaveLength(before + 1);
  return cards.provider.issued[before] ?? "";
}

function cancel(id: string) {
  return staff().post(`${LINKS}/${id}/cancel`);
}

async function linkRow(id: string) {
  return ctx.prisma.paymentLink.findUniqueOrThrow({ where: { id } });
}

describe("créer une demande de paiement libre", () => {
  it("rend un lien /payer/…, sans session Stripe, et la liste le sert", async () => {
    const created = await create();

    expect(created.url.startsWith(`${ROOT}/payer/`)).toBe(true);
    expect(await linkRow(created.id)).toMatchObject({
      status: "open",
      stripeSessionId: null,
      url: null,
    });
    const payLinks = await ctx.prisma.payLink.findMany({ where: { subjectId: created.id } });
    expect(payLinks).toMatchObject([{ subjectType: "free_charge", origin: "lafoliecoffee" }]);
    expect((await list()).map((view) => view.url)).toEqual([created.url]);

    const view = await ctx
      .http()
      .post(VIEW)
      .send({ token: tokenOf(created.url) })
      .expect(200);
    expect(view.body).toMatchObject({
      payable: true,
      amountCents: 12_000,
      payeeName: "La Folie Coffee",
      reference: "Régularisation août",
      dueOn: null,
    });
  });

  /** Régression : un double clic ouvrait deux pages payables pour la même somme. */
  it("le rejeu de la clé d'intention rend le même lien ; le scellé ne garde pas l'adresse", async () => {
    const { id: companyId } = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    const key = freshIntent();

    const first = await send(companyId, key);
    const replay = await send(companyId, key);

    expect(replay).toEqual(first);
    expect(await ctx.prisma.paymentLink.count()).toBe(1);
    expect(await ctx.prisma.payLink.count()).toBe(1);
    const sealed = await ctx.prisma.gestureIntent.findFirstOrThrow({
      where: { key },
      select: { result: true },
    });
    expect(sealed.result).toEqual({ id: first.id });
  });

  it("une ligne à moitié posée est refusée par le CHECK de la paire", async () => {
    const created = await create();
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "public"."payment_links" SET "stripe_session_id" = 'cs_seul'
        WHERE "id" = ${created.id}`,
    ).rejects.toThrow(/payment_links_checkout_pair/u);
  });
});

describe("payer par la porte", () => {
  it("le paiement passe la demande de paiement libre à payée, et la liste ne sert plus d'adresse", async () => {
    const created = await create();
    const providerRef = await startPaying(created.url);

    await cardPaid(ctx, providerRef);

    expect((await linkRow(created.id)).status).toBe("paid");
    const payment = await ctx.prisma.cardPayment.findFirstOrThrow({
      where: { subjectType: "free_charge", subjectId: created.id },
    });
    expect(payment).toMatchObject({ role: "first", amountCents: 12_000 });
    expect((await list())[0]).toMatchObject({ status: "paid", url: null });
    const view = await ctx
      .http()
      .post(VIEW)
      .send({ token: tokenOf(created.url) })
      .expect(200);
    expect(view.body).toEqual({ payable: false, reason: "settled" });
  });
});

describe("annuler une demande de paiement libre", () => {
  it("révoque le lien (404), puis l'abonné annule l'intention ; la liste n'a plus d'adresse", async () => {
    const created = await create();
    const providerRef = await startPaying(created.url);

    await cancel(created.id).expect(204);
    await ctx.drain();

    await ctx
      .http()
      .post(VIEW)
      .send({ token: tokenOf(created.url) })
      .expect(404);
    await ctx
      .http()
      .post(INTENT)
      .send({ token: tokenOf(created.url) })
      .expect(404);
    expect(cards.provider.cancelled).toContain(providerRef);
    expect((await list())[0]).toMatchObject({ status: "cancelled", url: null });
    await cancel(created.id).expect(409);
  });

  it("🔴 la course : une annulation entre la préparation et le rattachement refuse et libère", async () => {
    const created = await create();
    cards.provider.beforeIntent = async () => {
      await cancel(created.id).expect(204);
    };

    const refused = await ctx
      .http()
      .post(INTENT)
      .send({ token: tokenOf(created.url) })
      .expect(409);

    expect((refused.body as { code: string }).code).toBe("pay_link.withdrawn");
    const issued = cards.provider.issued[cards.provider.issued.length - 1] ?? "";
    expect(cards.provider.cancelled).toContain(issued);
    expect(await ctx.prisma.cardPayment.count({ where: { subjectId: created.id } })).toBe(0);
  });

  it("🔴 payée après annulation : l'argent est gardé, la cloche sonne une seule fois", async () => {
    const created = await create();
    const providerRef = await startPaying(created.url);
    cards.provider.cancellation = { kind: "already_paid" };

    await cancel(created.id).expect(204);
    await ctx.drain();
    await cardPaid(ctx, providerRef);

    const row = await linkRow(created.id);
    expect(row.status).toBe("paid");
    expect(row.cancelledAt).not.toBeNull();
    expect(
      await ctx.prisma.staffNotification.count({
        where: { kind: "payment_link.paid_after_cancel" },
      }),
    ).toBe(1);
  });
});

describe("rembourser une demande de paiement libre", () => {
  it("un remboursement fait chez le prestataire est rattaché à la demande de paiement libre, pas « hors commande »", async () => {
    const created = await create();
    const providerRef = await startPaying(created.url);
    await cardPaid(ctx, providerRef);

    await recordCardEvent(ctx, (eventId) => ({
      kind: "refund",
      eventId,
      eventType: "refund.created",
      providerRef,
      refundId: "re_fc_1",
      amountCents: 4_000,
      currency: "eur",
      status: "succeeded",
      createdAt: new Date(daysAgo(0)),
    }));

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { in: ["payment_link.refunded", "payment_refund.unmatched"] } },
      select: { type: true, payload: true },
    });
    expect(facts.map((fact) => fact.type)).toEqual(["payment_link.refunded"]);
    expect(facts[0]?.payload).toMatchObject({ amountCents: 4_000, status: "succeeded" });
    // La demande de paiement libre ne change pas d'état : l'avoir éventuel est un geste humain.
    expect((await linkRow(created.id)).status).toBe("paid");
  });
});
