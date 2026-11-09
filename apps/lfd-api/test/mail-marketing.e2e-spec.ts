/**
 * L'e-mail marketing et le consentement, contre le vrai Postgres (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, lots U3 et C1).
 *
 * Ce qu'un test unitaire ne peut pas dire : que le contrôle tient sur les
 * VRAIS chemins d'envoi (immédiat, différé par la boîte d'envoi), que la
 * fiche se range `refused` avec sa raison fermée, que le pied et les
 * en-têtes arrivent jusqu'au transport à travers le texte effectif, que la
 * double confirmation écrit le registre par le vrai jeton chiffré, et que la
 * purge ne touche que les demandes non confirmées.
 *
 * Doublés : le transport (il REND le modèle comme Resend le recevrait), la
 * nature des modèles (un modèle marketing d'ESSAI, que la production ne
 * porte pas), l'origine publique de l'espace (la boutique n'a pas d'URL en
 * test) et le cran de purge (`on`).
 */
import type { MailNature } from "@lfd/mail-blocks";
import type { MailReceipt, RenderedMail, SendMailArgs } from "@lfd/mailer";

import { MarketingConsent } from "../src/mail/channels/marketing/marketing-consent.js";
import { Mail } from "../src/mail/channels/requests/mail.js";
import { MarketingAddresses } from "../src/mail/marketing/application/services/marketing-addresses.js";
import { MarketingPreference } from "../src/mail/marketing/domain/entities/marketing-preference.js";
import { ConsentConfirmTokens } from "../src/mail/marketing/domain/ports/consent-confirm-tokens.js";
import { MarketingPreferenceRepository } from "../src/mail/marketing/domain/ports/marketing-preference.repository.js";
import { SpacePublicOrigins } from "../src/mail/marketing/domain/ports/space-public-origins.js";
import { MarketingMailRefusedError } from "../src/mail/requests/domain/errors/mail-request.errors.js";
import { MailNatures } from "../src/mail/requests/domain/ports/mail-natures.js";
import { MAIL_REQUEST_PURGE_MODE } from "../src/mail/requests/domain/services/mail-request-retention.js";
import type { MailBrandCode } from "../src/mail/requests/domain/value-objects/mail-brand.js";
import { b2bMailTemplates, type B2bMails } from "../src/mail/templates/mail-templates.js";
import { MAIL_TRANSPORT, type B2bMailer } from "../src/mail/templates/mailer.tokens.js";
import { natureOf } from "../src/mail/templates/sections/mail-block-declarations.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** Le modèle marketing d'essai : un modèle du registre que CE test seul déclare marketing. */
const TRIAL = "customer.company-attached";
const TRIAL_DATA: B2bMails[typeof TRIAL] = { firstName: "Colette", companyName: "Les Halles" };
const ORIGIN = "https://shop.lfc.test";
const ADDRESS = "colette@halles.fr";
const CONFIRM_PATH = "/mail/marketing/confirm/";

class TrialNatures extends MailNatures {
  natureOf(template: string): MailNature | null {
    return template === TRIAL ? "marketing" : natureOf(template);
  }
}

class ShopOrigin extends SpacePublicOrigins {
  originOf(space: MailBrandCode): string | null {
    return space === "lfc" ? ORIGIN : null;
  }
}

interface Sent {
  readonly template: string;
  readonly data: unknown;
  readonly headers: Readonly<Record<string, string>> | undefined;
  readonly rendered: RenderedMail;
}

/** Le transport doublé : il rend le modèle (le pied est injecté au rendu), et garde tout. */
class RenderingTransport implements B2bMailer {
  readonly enabled = true;
  readonly sent: Sent[] = [];
  private readonly registry = b2bMailTemplates({
    supportEmail: "admin@lfc.test",
    backOfficeUrl: "https://bo.lfc.test",
  });

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.sent.push({
      template: args.template,
      data: args.data,
      headers: args.headers,
      rendered: this.registry[args.template](args.data),
    });
    return Promise.resolve({ providerId: `re_${String(this.sent.length)}` });
  }
}

const transport = new RenderingTransport();
let ctx: E2eContext;
let mail: Mail;
let consent: MarketingConsent;
let unitOfWork: UnitOfWork;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: MAIL_TRANSPORT, value: transport },
      { token: MailNatures, value: new TrialNatures() },
      { token: SpacePublicOrigins, value: new ShopOrigin() },
      { token: MAIL_REQUEST_PURGE_MODE, value: "on" },
    ],
  });
  mail = ctx.app.get(Mail);
  consent = ctx.app.get(MarketingConsent);
  unitOfWork = ctx.app.get(UnitOfWork);
});

beforeEach(async () => {
  await ctx.reset();
  transport.sent.length = 0;
});

afterAll(async () => {
  await ctx.close();
});

const fiche = (key: string) =>
  ctx.prisma.mailRequest.findUniqueOrThrow({ where: { idempotencyKey: key } });
const registry = () => ctx.prisma.mailMarketingPreference.findMany({ orderBy: { id: "asc" } });

/** Le modèle d'essai, par la boîte d'envoi (le chemin différé). */
async function sendTrialDeferred(key: string): Promise<void> {
  await unitOfWork.run(() =>
    mail.send({
      template: TRIAL,
      to: ADDRESS,
      data: TRIAL_DATA,
      idempotencyKey: key,
      subjects: [],
    }),
  );
  await ctx.drain();
}

/** Une demande d'accord sur une adresse non vérifiée, et le jeton du lien envoyé. */
async function requestUnverified(): Promise<string> {
  await consent.request("lfc", ADDRESS, {
    textVersion: "case-commande-v1",
    locale: "fr",
    where: "order",
    ref: "cmd_42",
    verified: false,
  });
  await ctx.drain();
  const sent = transport.sent.find((one) => one.template === "customer.marketing-confirm");
  const data = sent?.data;
  const url =
    typeof data === "object" && data !== null && "confirmUrl" in data
      ? String(data.confirmUrl)
      : "";
  return url.slice(`${ORIGIN}/api/lfd${CONFIRM_PATH}`.length);
}

const visitor = () => ctx.http().set("x-lfc-client-ip", "203.0.113.77");

describe("U3 — le contrôle à l'envoi d'un e-mail marketing", () => {
  it("sans accord : `refused`/`no_consent`, rien chez Resend — chemin différé", async () => {
    await sendTrialDeferred("trial:none");

    expect(await fiche("trial:none")).toMatchObject({
      status: "refused",
      refusalCode: "no_consent",
    });
    expect(transport.sent).toEqual([]);
  });

  it("sans accord : l'envoi immédiat lève, et la fiche dit `no_consent`", async () => {
    await expect(
      mail.sendAndAwaitReceipt({
        template: TRIAL,
        to: ADDRESS,
        data: TRIAL_DATA,
        idempotencyKey: "trial:now",
        subjects: [],
      }),
    ).rejects.toBeInstanceOf(MarketingMailRefusedError);

    expect(await fiche("trial:now")).toMatchObject({
      status: "refused",
      refusalCode: "no_consent",
    });
    expect(transport.sent).toEqual([]);
  });

  it("désinscrite : `refused`/`unsubscribed`", async () => {
    await consent.unsubscribe("lfc", ADDRESS, "staff");

    await sendTrialDeferred("trial:unsub");

    expect(await fiche("trial:unsub")).toMatchObject({
      status: "refused",
      refusalCode: "unsubscribed",
    });
    expect(transport.sent).toEqual([]);
  });

  it("un transactionnel vers une adresse désinscrite part toujours, sans pied ni en-tête", async () => {
    await consent.unsubscribe("lfc", ADDRESS, "link");

    await mail.sendAndAwaitReceipt({
      template: "customer.password-reset",
      to: ADDRESS,
      data: { passwordSetupUrl: "https://auth.test/ticket" },
      idempotencyKey: "reset:1",
      subjects: [],
    });

    expect(await fiche("reset:1")).toMatchObject({ status: "sent", refusalCode: null });
    expect(transport.sent[0]?.headers).toBeUndefined();
    expect(transport.sent[0]?.rendered.html).not.toContain("data-mail-unsubscribe");
  });
});

describe("C1 — la double confirmation, puis l'envoi marketing", () => {
  it("adresse non vérifiée → `pending` + e-mail de confirmation ; clic → `accepted` ; l'offre part avec pied et en-têtes", async () => {
    const token = await requestUnverified();

    expect(await registry()).toMatchObject([
      { status: "pending", origin: "direct", acceptedWhere: "order", acceptedRef: "cmd_42" },
    ]);
    expect(transport.sent.map((one) => one.template)).toEqual(["customer.marketing-confirm"]);
    expect(transport.sent[0]?.headers).toBeUndefined();

    const page = await visitor().get(`${CONFIRM_PATH}${token}`).expect(200);
    expect(page.headers["cache-control"]).toBe("private, no-store");
    expect(page.headers["content-security-policy"]).toContain("default-src 'none'");
    expect((await registry())[0]?.status).toBe("pending");

    await visitor().post(`${CONFIRM_PATH}${token}`).expect(200);
    expect((await registry())[0]).toMatchObject({ status: "accepted" });

    transport.sent.length = 0;
    await sendTrialDeferred("trial:ok");

    expect(await fiche("trial:ok")).toMatchObject({ status: "sent", refusalCode: null });
    const [offer] = transport.sent;
    const unsubscribe = offer?.headers?.["List-Unsubscribe"] ?? "";
    expect(unsubscribe).toMatch(new RegExp(`^<${ORIGIN}/api/lfd/mail/unsubscribe/[^>]+>$`, "u"));
    expect(offer?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const url = unsubscribe.slice(1, -1);
    expect(offer?.rendered.html).toContain(`href="${url}"`);
    expect(offer?.rendered.text).toContain(url);
    expect(url).not.toContain("colette");
  });

  it("jeton altéré, rejoué, expiré : la même page, et rien n'est écrit", async () => {
    const token = await requestUnverified();
    const before = await registry();
    const altered = `${token.slice(0, -2)}${token.endsWith("A") ? "B" : "A"}${token.slice(-1)}`;
    const issuedAt = new Date(daysAgo(8));
    const addresses = ctx.app.get(MarketingAddresses);
    await ctx.app.get(MarketingPreferenceRepository).save(
      MarketingPreference.requested("pref_old", "lfc", addresses.of("ancien@halles.fr"), {
        proof: { textVersion: "v1", locale: "fr", place: "newsletter", ref: null },
        origin: "direct",
        at: issuedAt,
      }),
    );
    const expired = ctx.app
      .get(ConsentConfirmTokens)
      .seal({ space: "lfc", recipientKey: "ancien@halles.fr", issuedAt });

    const forged = await visitor().post(`${CONFIRM_PATH}${altered}`).expect(200);
    const late = await visitor().post(`${CONFIRM_PATH}${expired}`).expect(200);

    expect(forged.text).toBe(late.text);
    expect((await registry()).map((row) => row.status)).toEqual(["pending", "pending"]);
    expect((await registry()).find((row) => row.id !== "pref_old")).toEqual(before[0]);

    const valid = await visitor().post(`${CONFIRM_PATH}${token}`).expect(200);
    const afterFirst = await registry();
    const replayed = await visitor().post(`${CONFIRM_PATH}${token}`).expect(200);
    expect(valid.text).toBe(forged.text);
    expect(replayed.text).toBe(forged.text);
    expect(await registry()).toEqual(afterFirst);
  });

  it("une adresse désinscrite n'est jamais repassée : ni ligne neuve, ni e-mail", async () => {
    await consent.unsubscribe("lfc", ADDRESS, "link");

    await requestUnverified();

    expect((await registry()).map((row) => row.status)).toEqual(["unsubscribed"]);
    expect(transport.sent).toEqual([]);
  });
});

describe("C1 — la purge des demandes jamais confirmées", () => {
  it("supprime les `pending` de plus de 7 jours, et elles seules", async () => {
    const addresses = ctx.app.get(MarketingAddresses);
    const repository = ctx.app.get(MarketingPreferenceRepository);
    const proof = { textVersion: "v1", locale: "fr", place: "order", ref: null } as const;
    const seed = (id: string, address: string, at: string, accept: boolean) => {
      const draft = { proof, origin: "direct", at: new Date(at) } as const;
      const target = addresses.of(address);
      return repository.save(
        accept
          ? MarketingPreference.accepted(id, "lfc", target, draft)
          : MarketingPreference.requested(id, "lfc", target, draft),
      );
    };
    await seed("old_pending", "a@halles.fr", daysAgo(8), false);
    await seed("fresh_pending", "b@halles.fr", daysAgo(6), false);
    await seed("old_accepted", "c@halles.fr", daysAgo(400), true);

    const report = jsonBody<Record<string, unknown>>(
      await ctx
        .http()
        .post("/admin/mail/requests/purge")
        .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
        .expect(200),
    );

    expect(report["pendingConsents"]).toMatchObject({ mode: "on", purged: 1 });
    expect((await registry()).map((row) => row.id).sort()).toEqual([
      "fresh_pending",
      "old_accepted",
    ]);
  });
});
