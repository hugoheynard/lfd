/**
 * E2E des **liens de paiement vers un sujet** (plan
 * `documentation/payment/liens-de-paiement/plan-le-lien-vers-un-sujet.md`,
 * lot P1, §2.1 à §2.3).
 *
 * Ce que seul le vrai SQL prouve :
 * - un seul lien vivant par sujet (l'index partiel), et la révocation posée
 *   en paire (le CHECK), une seule fois (le déclencheur) ;
 * - un seul `first` par sujet : deux intentions, même concurrentes, en
 *   laissent un, qui porte son `pay_link_id`, immuable ;
 * - le même 404 pour un jeton inconnu et un lien révoqué.
 *
 * Aucun sujet réel n'implémente encore `LinkableSubject` : la suite range un
 * sujet de test (`test_charge`) aux trois registres que la racine de
 * composition remplit. Frontières doublées : le prestataire de carte, et la
 * racine publique de l'origine.
 */
import type { PayLinkIntent, PayLinkView } from "@lfd/contracts";

import { PayLinks, SYSTEM_PAY_LINK_AUTHOR } from "../src/payment/channels/requests/index.js";
import {
  type CardSubject,
  LinkableSubject,
  LinkableSubjects,
  RegisteredLinkableSubjects,
  RegisteredSubjectSettlements,
  type SubjectQuote,
  SubjectSettlements,
} from "../src/payment/channels/subjects/index.js";
import {
  TestSubjectSettlement,
  Timeline,
} from "../src/payment/card/application/__tests__/card-payment-doubles.js";
import { CardProviders } from "../src/payment/card/domain/ports/card-providers.js";
import { PayLinkOrigins } from "../src/payment/link/domain/ports/pay-link-origins.js";
import { FixedOrigins } from "../src/payment/link/application/__tests__/pay-link-doubles.js";
import {
  CardAccountDefaults,
  DeclaredCardAccountDefaults,
} from "../src/platform/config/card-accounts.js";
import { bootstrapE2e, type E2eContext, jsonBody } from "./e2e-harness.js";
import { cardProvidersDouble } from "./card-payments.js";

const SUBJECT_TYPE = "test_charge";
const ROOT = "https://app.lfc.test";
const VIEW = "/pay-links/view";
const INTENT = "/pay-links/intent";
/** Un jeton de la bonne forme, qu'aucun lien ne porte. */
const UNKNOWN_TOKEN = "A".repeat(43);

/** Le sujet de test : son devis se règle d'un test à l'autre. */
class E2eLinkable extends LinkableSubject {
  readonly subjectType = SUBJECT_TYPE;
  quote_: SubjectQuote = {
    payable: true,
    amountCents: 4_200,
    payeeName: "La Folie Douce",
    payerName: "Café des Arts",
    reference: "REG-0001",
    dueOn: null,
  };

  quote(_subject: CardSubject): Promise<SubjectQuote> {
    return Promise.resolve(this.quote_);
  }
}

/**
 * Le canal retour du sujet de test, avec un VRAI verrou : celui d'un sujet
 * réel est un `FOR UPDATE` sur sa ligne ; ici, un verrou consultatif de la
 * transaction, sur l'identifiant du sujet.
 */
class LockingSettlement extends TestSubjectSettlement {
  override async lockSubject(subject: CardSubject): Promise<void> {
    await ctx.prisma.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${subject.id}))::text`;
  }
}

const cards = cardProvidersDouble("pi_paylink");
const linkable = new E2eLinkable();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: CardProviders, value: cards },
      {
        token: CardAccountDefaults,
        value: new DeclaredCardAccountDefaults({ [SUBJECT_TYPE]: "lfc-stripe" }),
      },
      {
        token: SubjectSettlements,
        value: new RegisteredSubjectSettlements([
          new LockingSettlement(new Timeline(), SUBJECT_TYPE),
        ]),
      },
      { token: LinkableSubjects, value: new RegisteredLinkableSubjects([linkable]) },
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
  linkable.quote_ = {
    payable: true,
    amountCents: 4_200,
    payeeName: "La Folie Douce",
    payerName: "Café des Arts",
    reference: "REG-0001",
    dueOn: null,
  };
});

/** Le corps d'un refus, tel que le filtre d'erreurs l'écrit. */
interface ErrorBody {
  readonly code: string;
  readonly message: string;
}

let subjectCount = 0;
/** Un sujet neuf par test : les intentions du double ne se croisent pas. */
function freshSubject(): CardSubject {
  subjectCount += 1;
  return { type: SUBJECT_TYPE, id: `chg_${String(subjectCount)}` };
}

async function openLink(subject: CardSubject): Promise<{ linkId: string; token: string }> {
  const opened = await ctx.app.get(PayLinks).open(subject, {
    origin: "lafoliecoffee",
    payerLabel: "Café des Arts",
    by: SYSTEM_PAY_LINK_AUTHOR,
    byLabel: null,
  });
  const token = opened.url.slice(`${ROOT}/payer/`.length);
  return { linkId: opened.linkId, token };
}

describe("ouvrir un lien", () => {
  it("deux ouvertures sur un même sujet rendent le même lien, une seule ligne, jeton jamais en clair", async () => {
    const subject = freshSubject();
    const first = await openLink(subject);
    const second = await openLink(subject);
    expect(second).toEqual(first);
    const rows = await ctx.prisma.payLink.findMany({ where: { subjectId: subject.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toContain(first.token);
    expect(rows[0]?.tokenSealed).not.toContain(first.token);
  });

  it("refuse une origine hors du registre", async () => {
    await expect(
      ctx.app
        .get(PayLinks)
        .open(freshSubject(), { origin: "ailleurs", payerLabel: "X", by: "system", byLabel: null }),
    ).rejects.toMatchObject({ code: "pay_link.origin.unknown" });
  });
});

describe("la page : POST /pay-links/view", () => {
  it("rend ce que le sujet montre, sans cache", async () => {
    const { token } = await openLink(freshSubject());
    const response = await ctx.http().post(VIEW).send({ token }).expect(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const view = response.body as PayLinkView;
    expect(view).toEqual({
      payable: true,
      amountCents: 4_200,
      payeeName: "La Folie Douce",
      payerName: "Café des Arts",
      reference: "REG-0001",
      dueOn: null,
    });
  });

  it("un jeton inconnu et un lien révoqué donnent le même 404", async () => {
    const subject = freshSubject();
    const { token } = await openLink(subject);
    expect(await ctx.app.get(PayLinks).revoke(subject, "réglé ailleurs")).toBe(true);
    const unknown = await ctx.http().post(VIEW).send({ token: UNKNOWN_TOKEN }).expect(404);
    const revoked = await ctx.http().post(VIEW).send({ token }).expect(404);
    const unknownBody = jsonBody<ErrorBody>(unknown);
    const revokedBody = jsonBody<ErrorBody>(revoked);
    expect({ code: revokedBody.code, message: revokedBody.message }).toEqual({
      code: unknownBody.code,
      message: unknownBody.message,
    });
    expect(revokedBody.code).toBe("pay_link.not_found");
  });

  it("refuse un jeton mal formé avant toute lecture", async () => {
    await ctx.http().post(VIEW).send({ token: "court" }).expect(400);
  });
});

describe("payer : POST /pay-links/intent", () => {
  it("deux intentions ne laissent qu'un first, qui porte son lien ; le rejeu relit", async () => {
    const subject = freshSubject();
    const { linkId, token } = await openLink(subject);
    const before = cards.provider.issued.length;
    const first = await ctx.http().post(INTENT).send({ token }).expect(200);
    const replay = await ctx.http().post(INTENT).send({ token }).expect(200);
    expect((replay.body as PayLinkIntent).collection).toEqual(
      (first.body as PayLinkIntent).collection,
    );
    expect((first.body as PayLinkIntent).amountCents).toBe(4_200);
    expect(cards.provider.issued.length - before).toBe(1);
    const payments = await ctx.prisma.cardPayment.findMany({ where: { subjectId: subject.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ role: "first", payLinkId: linkId, amountCents: 4_200 });
  });

  it("deux intentions concurrentes ne laissent qu'un first ; l'intention de trop est annulée", async () => {
    const subject = freshSubject();
    const { token } = await openLink(subject);
    const [a, b] = await Promise.all([
      ctx.http().post(INTENT).send({ token }),
      ctx.http().post(INTENT).send({ token }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((a.body as PayLinkIntent).collection).toEqual((b.body as PayLinkIntent).collection);
    const payments = await ctx.prisma.cardPayment.findMany({ where: { subjectId: subject.id } });
    expect(payments).toHaveLength(1);
  });

  it("pay_link_id est immuable une fois la ligne écrite", async () => {
    const subject = freshSubject();
    const { token } = await openLink(subject);
    await ctx.http().post(INTENT).send({ token }).expect(200);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "payment"."card_payment" SET "pay_link_id" = NULL
        WHERE "subject_id" = ${subject.id}`,
    ).rejects.toThrow(/le lien d'où vient un paiement ne change pas/u);
  });

  it("refuse un sujet qui n'est plus dû, sans créer d'intention", async () => {
    const subject = freshSubject();
    const { token } = await openLink(subject);
    linkable.quote_ = { payable: false, reason: "settled" };
    const before = cards.provider.issued.length;
    const refused = await ctx.http().post(INTENT).send({ token }).expect(409);
    expect(jsonBody<ErrorBody>(refused).code).toBe("pay_link.subject.not_payable");
    expect(cards.provider.issued.length).toBe(before);
    const view = await ctx.http().post(VIEW).send({ token }).expect(200);
    expect(view.body).toEqual({ payable: false, reason: "settled" });
  });

  it("répond 409 « lien à refaire » quand l'intention relue est close", async () => {
    const subject = freshSubject();
    const { token } = await openLink(subject);
    await ctx.http().post(INTENT).send({ token }).expect(200);
    const ref = cards.provider.issued[cards.provider.issued.length - 1] ?? "";
    cards.provider.states.set(ref, "canceled");
    const refused = await ctx.http().post(INTENT).send({ token }).expect(409);
    expect(jsonBody<ErrorBody>(refused).code).toBe("pay_link.intent.closed");
  });

  it("répond 404 pour un jeton inconnu", async () => {
    await ctx.http().post(INTENT).send({ token: UNKNOWN_TOKEN }).expect(404);
  });
});

describe("les gardes de la table", () => {
  it("un second lien vivant sur un même sujet est refusé par l'index partiel", async () => {
    const subject = freshSubject();
    await openLink(subject);
    await expect(
      ctx.prisma.$executeRaw`
        INSERT INTO "payment"."pay_link"
          ("id", "subject_type", "subject_id", "origin", "payer_label", "token_hash",
           "token_sealed", "created_at", "created_by")
        VALUES ('pl_dup', ${subject.type}, ${subject.id}, 'lafoliecoffee', 'X', 'h_dup',
                's_dup', now(), 'system')`,
    ).rejects.toThrow(/pay_link_live_per_subject_key/u);
  });

  it("une révocation sans motif est refusée par le CHECK", async () => {
    const subject = freshSubject();
    await openLink(subject);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "payment"."pay_link" SET "revoked_at" = now()
        WHERE "subject_id" = ${subject.id}`,
    ).rejects.toThrow(/pay_link_revoked_pair/u);
  });

  it("un lien révoqué ne se ranime pas, et un neuf s'ouvre à côté", async () => {
    const subject = freshSubject();
    const first = await openLink(subject);
    await ctx.app.get(PayLinks).revoke(subject, "réglé ailleurs");
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "payment"."pay_link" SET "revoked_at" = NULL, "revoked_reason" = NULL
        WHERE "id" = ${first.linkId}`,
    ).rejects.toThrow(/un lien ne se ranime pas/u);
    const reopened = await openLink(subject);
    expect(reopened.linkId).not.toBe(first.linkId);
  });

  it("un lien ne s'efface pas", async () => {
    const { linkId } = await openLink(freshSubject());
    await expect(
      ctx.prisma.$executeRaw`DELETE FROM "payment"."pay_link" WHERE "id" = ${linkId}`,
    ).rejects.toThrow(/ne s'efface pas/u);
  });
});
