/**
 * La désinscription par le lien d'un e-mail, contre le vrai Postgres (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, lot U2).
 *
 * Ce qu'un test unitaire ne peut pas dire : que le GET ne désinscrit pas,
 * que le POST écrit le registre une fois, que la réponse est la même pour
 * tout jeton, que le one-click d'une messagerie n'est pas bloqué par le seau
 * par IP, que l'effacement laisse l'empreinte qui protège — et qu'aucune
 * adresse ne finit dans l'URL, la page ou les logs.
 */
import type { LoggerService } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { MarketingConsent } from "../src/mail/channels/marketing/marketing-consent.js";
import { EraseMarketingPreferencesCommand } from "../src/mail/marketing/application/commands/erase-marketing-preferences.command.js";
import { MarketingAddresses } from "../src/mail/marketing/application/services/marketing-addresses.js";
import { MarketingPreference } from "../src/mail/marketing/domain/entities/marketing-preference.js";
import { MarketingPreferenceRepository } from "../src/mail/marketing/domain/ports/marketing-preference.repository.js";
import { UnsubscribeTokens } from "../src/mail/marketing/domain/ports/unsubscribe-tokens.js";
import { MailRequest } from "../src/mail/requests/domain/entities/mail-request.js";
import { MailRequestRepository } from "../src/mail/requests/domain/ports/mail-request.repository.js";
import { MailSendReader } from "../src/mail/sends/domain/ports/mail-send.reader.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

/** Les lignes que l'application écrit au journal technique, pour y chercher une adresse. */
class RecordingLogger implements LoggerService {
  readonly lines: string[] = [];
  log(message: unknown): void {
    this.lines.push(String(message));
  }
  error(message: unknown): void {
    this.lines.push(String(message));
  }
  warn(message: unknown): void {
    this.lines.push(String(message));
  }
  debug(message: unknown): void {
    this.lines.push(String(message));
  }
  verbose(message: unknown): void {
    this.lines.push(String(message));
  }
}

const ADDRESS = "colette@halles.fr";
const PATH = "/mail/unsubscribe/";
const logger = new RecordingLogger();
let ctx: E2eContext;
let ip = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e();
  ctx.app.useLogger(logger);
});

beforeEach(async () => {
  await ctx.reset();
  logger.lines.length = 0;
});

afterAll(async () => {
  await ctx.close();
});

/** Un visiteur à une IP neuve : le seau par IP ne déborde pas d'un test à l'autre. */
function visitor(fixedIp?: string) {
  ip += 1;
  return ctx.http().set("x-lfc-client-ip", fixedIp ?? `203.0.113.${String(ip % 250)}`);
}

const tokenFor = (address: string, space: "lfc" | "lfd" = "lfc") =>
  ctx.app.get(UnsubscribeTokens).seal({ space, recipientKey: address.toLowerCase() });

/** Le jeton, son étiquette d'authentification altérée. */
function altered(token: string): string {
  const parts = token.split(".");
  const tag = parts[3] ?? "";
  parts[3] = `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`;
  return parts.join(".");
}

const rows = () => ctx.prisma.mailMarketingPreference.findMany({ orderBy: { space: "asc" } });

async function seedAccepted(space: "lfc" | "lfd"): Promise<void> {
  const address = ctx.app.get(MarketingAddresses).of(ADDRESS);
  await ctx.app.get(MarketingPreferenceRepository).save(
    MarketingPreference.accepted(`pref_${space}`, space, address, {
      proof: { textVersion: `${space}-1`, locale: "fr", place: "signup", ref: null },
      origin: "partners",
      at: new Date(Date.UTC(2026, 0, 1)),
    }),
  );
}

describe("GET — une page neutre, qui ne désinscrit jamais", () => {
  it("rend la même page pour un jeton valide et un jeton altéré, sans rien écrire", async () => {
    const token = tokenFor(ADDRESS);

    const valid = await visitor().get(`${PATH}${token}`).expect(200);
    const forged = await visitor()
      .get(`${PATH}${altered(token)}`)
      .expect(200);

    expect(valid.text).toBe(forged.text);
    expect(valid.text).toContain('<form method="post">');
    expect(valid.headers["content-type"]).toContain("text/html");
    expect(valid.headers["cache-control"]).toBe("private, no-store");
    expect(valid.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(valid.headers["referrer-policy"]).toBe("no-referrer");
    expect(await rows()).toEqual([]);
  });

  it("parle la langue du navigateur", async () => {
    const page = await visitor()
      .get(`${PATH}${tokenFor(ADDRESS)}`)
      .set("Accept-Language", "it-IT,it;q=0.9")
      .expect(200);
    expect(page.text).toContain('lang="it"');
  });

  it("le GET garde la limite par IP", async () => {
    const sameIp = "198.18.0.1";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await visitor(sameIp)
        .get(`${PATH}${tokenFor(ADDRESS)}`)
        .expect(200);
    }
    await visitor(sameIp)
      .get(`${PATH}${tokenFor(ADDRESS)}`)
      .expect(429);
  });
});

describe("POST — désinscrit, idempotent, la même réponse pour tout jeton", () => {
  it("désinscrit l'espace du jeton, une fois : le second POST ne change rien", async () => {
    const token = tokenFor(ADDRESS);

    const first = await visitor().post(`${PATH}${token}`).type("form").send({}).expect(200);
    const [row] = await rows();
    const second = await visitor().post(`${PATH}${token}`).type("form").send({}).expect(200);

    expect(second.text).toBe(first.text);
    expect(row).toMatchObject({
      space: "lfc",
      recipientKey: ADDRESS,
      status: "unsubscribed",
      unsubscribedSource: "link",
    });
    expect(await rows()).toEqual([row]);
    await expect(ctx.app.get(MarketingConsent).preferenceOf("lfd", ADDRESS)).resolves.toBeNull();
  });

  it("un jeton altéré rend la même page, et rien n'est écrit", async () => {
    const token = tokenFor(ADDRESS);
    const forged = await visitor()
      .post(`${PATH}${altered(token)}`)
      .expect(200);
    expect(await rows()).toEqual([]);

    const valid = await visitor().post(`${PATH}${token}`).expect(200);
    expect(valid.text).toBe(forged.text);
  });

  it("le one-click de la RFC 8058 désinscrit, source `one_click`", async () => {
    await visitor()
      .post(`${PATH}${tokenFor(ADDRESS)}`)
      .type("form")
      .send("List-Unsubscribe=One-Click")
      .expect(200);

    expect(await rows()).toEqual([
      expect.objectContaining({ status: "unsubscribed", unsubscribedSource: "one_click" }),
    ]);
  });

  it("« tout le groupe » désinscrit aussi les autres lignes de l'adresse", async () => {
    await seedAccepted("lfd");

    await visitor()
      .post(`${PATH}${tokenFor(ADDRESS)}`)
      .type("form")
      .send({ group: "all" })
      .expect(200);

    expect((await rows()).map((row) => [row.space, row.status, row.unsubscribedSource])).toEqual([
      ["lfc", "unsubscribed", "link"],
      ["lfd", "unsubscribed", "group"],
    ]);
  });

  it("sans « tout le groupe », l'autre espace garde son accord", async () => {
    await seedAccepted("lfd");

    await visitor()
      .post(`${PATH}${tokenFor(ADDRESS)}`)
      .expect(200);

    await expect(ctx.app.get(MarketingConsent).preferenceOf("lfd", ADDRESS)).resolves.toBe(
      "accepted",
    );
  });

  /**
   * B1 : les POST « One-Click » viennent de quelques serveurs de Gmail ; le
   * seau par IP les aurait bloqués après un envoi en nombre.
   */
  it("30 POST d'une même IP, jetons distincts, passent tous ; un même jeton est borné", async () => {
    const gmail = "209.85.220.41";
    for (let index = 0; index < 30; index += 1) {
      await visitor(gmail)
        .post(`${PATH}${tokenFor(`client${String(index)}@halles.fr`)}`)
        .type("form")
        .send("List-Unsubscribe=One-Click")
        .expect(200);
    }
    expect(await rows()).toHaveLength(30);

    const token = tokenFor(ADDRESS);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await visitor().post(`${PATH}${token}`).expect(200);
    }
    await visitor().post(`${PATH}${token}`).expect(429);
  });
});

describe("aucune adresse dans l'URL, la page ni les logs", () => {
  it("ni le jeton, ni les pages, ni le journal technique ne portent l'adresse", async () => {
    const token = tokenFor(ADDRESS);
    const page = await visitor().get(`${PATH}${token}`).expect(200);
    const done = await visitor().post(`${PATH}${token}`).expect(200);

    for (const text of [token, page.text, done.text, ...logger.lines]) {
      expect(text).not.toContain("colette");
      expect(text).not.toContain("halles");
    }
    expect(logger.lines.join("\n")).not.toContain(token);
  });
});

describe("l'effacement ne rouvre pas la porte (règle 23)", () => {
  it("une adresse effacée garde son empreinte et reste désinscrite ; un accord, lui, part", async () => {
    await seedAccepted("lfd");
    await visitor()
      .post(`${PATH}${tokenFor(ADDRESS)}`)
      .expect(200);

    await ctx.app.get(CommandBus).execute(new EraseMarketingPreferencesCommand(ADDRESS));

    const after = await rows();
    expect(after).toEqual([
      expect.objectContaining({ space: "lfc", recipientKey: null, status: "unsubscribed" }),
    ]);
    expect(after[0]?.print).toBe(ctx.app.get(MarketingAddresses).of(ADDRESS).print);
    const consent = ctx.app.get(MarketingConsent);
    await expect(consent.preferenceOf("lfc", ADDRESS)).resolves.toBe("unsubscribed");
    await expect(consent.preferenceOf("lfd", ADDRESS)).resolves.toBeNull();

    // Un ancien lien suivi après l'effacement ne recrée pas de ligne.
    await visitor()
      .post(`${PATH}${tokenFor(ADDRESS)}`)
      .expect(200);
    expect(await rows()).toHaveLength(1);
  });
});

describe("la raison fermée d'un refus, au suivi", () => {
  it("`refusal_code` se range et se relit", async () => {
    const mail = MailRequest.request({
      id: "mail_news",
      template: "customer.order-ready",
      brand: "lfc",
      recipient: ADDRESS,
      locale: "fr",
      idempotencyKey: "news:e2e",
      requestedAt: new Date(),
    });
    mail.markRefusedFor("unsubscribed", new Date());
    await ctx.app.get(MailRequestRepository).save(mail);

    await expect(ctx.app.get(MailSendReader).detail("mail_news")).resolves.toMatchObject({
      status: "refused",
      refusalCode: "unsubscribed",
    });
  });
});
