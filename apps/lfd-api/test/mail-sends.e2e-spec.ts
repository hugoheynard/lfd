/**
 * E2E du **suivi des e-mails** (plan `documentation/mail/plan-suivi-des-e-mails.md`,
 * lot T2) : le droit `mail_sends`, la liste masquée et triée (problèmes
 * d'abord, sonde à part), le détail sans adresse ni raison d'échec, la
 * révélation tracée qui vaut 5 minutes pour son seul auteur, le plafond de
 * 30 consultations par heure, et aucune adresse au journal ni dans les logs.
 *
 * Les demandes sont posées par l'agrégat (`MailRequest`) et rangées par son
 * dépôt ; l'horloge est fixée pour faire expirer une révélation.
 */
import type { LoggerService } from "@nestjs/common";
import type {
  MailRecipientSearchCreatedView,
  MailRecipientSearchView,
  MailRecipientView,
  MailSendDetailView,
  MailSendListView,
} from "@lfd/contracts";

import { MailRequest } from "../src/mail/requests/domain/entities/mail-request.js";
import { MailRequestRepository } from "../src/mail/requests/domain/ports/mail-request.repository.js";
import { MAIL_CONSULTATIONS_PER_HOUR } from "../src/mail/sends/domain/entities/staff-mail-consultations.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

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

const MINUTE = 60_000;
const SENDS = "/admin/mail/sends";
const ADDRESS = "colette@halles.fr";
const clock = new FixedClock(new Date());
const logger = new RecordingLogger();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: Clock, value: clock },
    ],
  });
  ctx.app.useLogger(logger);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  clock.set(new Date());
  logger.lines.length = 0;
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Une fiche staff de plus, d'un rôle donné. */
async function colleague(role: "admin" | "support", sub: string) {
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Collègue",
      lastName: sub,
      email: `${sub}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

interface Seed {
  readonly id: string;
  readonly template?: string;
  readonly minutesAgo: number;
  readonly outcome: "requested" | "accepted" | "dry_run" | "failed" | "bounced" | "delayed";
}

/** Une demande posée par l'agrégat, puis menée à son issue. */
async function seed({ id, template, minutesAgo, outcome }: Seed): Promise<void> {
  const at = new Date(clock.now().getTime() - minutesAgo * MINUTE);
  const request = MailRequest.request({
    id,
    template: template ?? "customer.access-opened",
    brand: "lfc",
    recipient: ADDRESS,
    locale: "fr",
    idempotencyKey: `e2e:${id}`,
    requestedAt: at,
  });
  if (outcome === "failed") {
    request.markFailed(`Resend a refusé ${ADDRESS}`, at);
  } else if (outcome !== "requested") {
    request.markSent(outcome === "dry_run" ? null : `re_${id}`, at, 2);
  }
  if (outcome === "bounced" || outcome === "delayed") {
    request.recordDelivery({ delivery: outcome, kind: "Permanent/General", at });
  }
  await ctx.app.get(MailRequestRepository).save(request);
}

function search(agent: ReturnType<E2eContext["asSub"]>, address: string) {
  return agent.post(`${SENDS}/searches`).send({ address });
}

function reveal(agent: ReturnType<E2eContext["asSub"]>, id: string) {
  return agent.post(`${SENDS}/${id}/recipient-reveal`);
}

describe("le droit `mail_sends`", () => {
  it("sans le droit, la liste, le détail et la révélation sont refusés (403)", async () => {
    await seed({ id: "send_1", minutesAgo: 1, outcome: "accepted" });
    const support = await colleague("support", "staff-support");

    await support.get(SENDS).expect(403);
    await support.get(`${SENDS}/send_1`).expect(403);
    await reveal(support, "send_1").expect(403);
    await support.get(`${SENDS}/send_1/recipient`).expect(403);
  });
});

describe("la liste", () => {
  it("masque l'adresse, met les problèmes en tête, et laisse la sonde à part", async () => {
    await seed({ id: "ok_recent", minutesAgo: 1, outcome: "accepted" });
    await seed({ id: "delayed", minutesAgo: 30, outcome: "delayed" });
    await seed({ id: "bounced", minutesAgo: 20, outcome: "bounced" });
    await seed({ id: "failed", minutesAgo: 40, outcome: "failed" });
    await seed({ id: "blank", minutesAgo: 2, outcome: "dry_run" });
    await seed({ id: "probe", template: "ops.deploy-check", minutesAgo: 3, outcome: "failed" });

    const response = await staff().get(SENDS).expect(200);
    const view = jsonBody<MailSendListView>(response);

    expect(view.items.map((item) => [item.id, item.state, item.delivery])).toEqual([
      ["failed", "failed", null],
      ["bounced", "accepted", "bounced"],
      ["delayed", "accepted", "delayed"],
      ["ok_recent", "accepted", null],
      ["blank", "accepted", "dry_run"],
    ]);
    expect(view.items.every((item) => item.recipient === "c•••@halles.fr")).toBe(true);
    expect(response.text).not.toContain(ADDRESS);
    expect(response.text).not.toContain("Resend a refusé");

    const probes = jsonBody<MailSendListView>(
      await staff().get(SENDS).query({ scope: "probes" }).expect(200),
    );
    expect(probes.items.map((item) => item.id)).toEqual(["probe"]);
  });

  it("pagine par curseur, sans perdre ni doubler une ligne", async () => {
    for (let index = 0; index < 5; index += 1) {
      await seed({ id: `send_${String(index)}`, minutesAgo: index, outcome: "accepted" });
    }
    await seed({ id: "failed", minutesAgo: 10, outcome: "failed" });

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: Record<string, string> = { limit: "2", ...(cursor === null ? {} : { cursor }) };
      const page = jsonBody<MailSendListView>(await staff().get(SENDS).query(query).expect(200));
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(seen).toEqual(["failed", "send_0", "send_1", "send_2", "send_3", "send_4"]);
  });

  it("filtre par état servi, par retour et par période", async () => {
    await seed({ id: "old", minutesAgo: 120, outcome: "accepted" });
    await seed({ id: "blank", minutesAgo: 2, outcome: "dry_run" });
    await seed({ id: "failed", minutesAgo: 3, outcome: "failed" });

    const ids = async (query: Record<string, string>) =>
      jsonBody<MailSendListView>(await staff().get(SENDS).query(query).expect(200)).items.map(
        (item) => item.id,
      );

    expect(await ids({ state: "accepted" })).toEqual(["blank", "old"]);
    expect(await ids({ delivery: "dry_run" })).toEqual(["blank"]);
    const from = new Date(clock.now().getTime() - 60 * MINUTE).toISOString();
    expect(await ids({ from })).toEqual(["failed", "blank"]);
  });

  it("refuse une forme inconnue (400), une adresse en paramètre comprise", async () => {
    await staff().get(SENDS).query({ state: "sent" }).expect(400);
    await staff().get(SENDS).query({ recipient: ADDRESS }).expect(400);
    await staff().get(SENDS).query({ cursor: "pas-un-curseur" }).expect(400);
  });
});

describe("le détail", () => {
  it("n'a ni l'adresse en clair ni la raison d'un échec", async () => {
    await seed({ id: "failed", minutesAgo: 5, outcome: "failed" });

    const response = await staff().get(`${SENDS}/failed`).expect(200);
    const view = jsonBody<MailSendDetailView>(response);

    expect(view).toMatchObject({ id: "failed", recipient: "c•••@halles.fr", state: "failed" });
    expect(view.steps.map((step) => step.step)).toEqual(["requested", "failed"]);
    expect(response.text).not.toContain(ADDRESS);
    expect(response.text).not.toContain("Resend a refusé");
    expect(Object.keys(view)).not.toContain("failureReason");
  });

  it("404 nommé pour un envoi inconnu", async () => {
    const response = await staff().get(`${SENDS}/absent`).expect(404);
    expect(response.text).toContain("n'est pas au suivi des e-mails");
  });
});

describe("la révélation de l'adresse", () => {
  it("révéler puis lire rend l'adresse et la raison ; le journal n'a pas l'adresse", async () => {
    await seed({ id: "failed", minutesAgo: 5, outcome: "failed" });

    await reveal(staff(), "failed").expect(204);
    const view = jsonBody<MailRecipientView>(
      await staff().get(`${SENDS}/failed/recipient`).expect(200),
    );

    expect(view).toMatchObject({
      id: "failed",
      recipient: ADDRESS,
      failureReason: `Resend a refusé ${ADDRESS}`,
    });
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "mail.recipient_revealed" },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ subjectType: "mail_send", subjectId: "failed" });
    expect(JSON.stringify(facts)).not.toContain("halles.fr");
    expect(logger.lines.join("\n")).not.toContain(ADDRESS);
  });

  it("lire sans avoir révélé est refusé (403 nommé), et ne trace rien", async () => {
    await seed({ id: "send_1", minutesAgo: 1, outcome: "accepted" });

    const response = await staff().get(`${SENDS}/send_1/recipient`).expect(403);

    expect(response.text).toContain("Afficher l'adresse");
    expect(response.text).not.toContain(ADDRESS);
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "mail.recipient_revealed" } }),
    ).toBe(0);
  });

  it("une révélation expire au bout de 5 minutes", async () => {
    await seed({ id: "send_1", minutesAgo: 1, outcome: "accepted" });
    await reveal(staff(), "send_1").expect(204);

    clock.advanceMs(4 * MINUTE);
    await staff().get(`${SENDS}/send_1/recipient`).expect(200);
    clock.advanceMs(MINUTE);
    await staff().get(`${SENDS}/send_1/recipient`).expect(403);
  });

  it("un collègue ne lit pas la révélation d'un autre", async () => {
    await seed({ id: "send_1", minutesAgo: 1, outcome: "accepted" });
    const bruno = await colleague("admin", "staff-bruno");
    await reveal(staff(), "send_1").expect(204);

    await bruno.get(`${SENDS}/send_1/recipient`).expect(403);
  });

  it("révéler un envoi inconnu est un 404 nommé", async () => {
    await reveal(staff(), "absent").expect(404);
    expect(await ctx.prisma.mailRecipientReveal.count()).toBe(0);
  });

  it("refuse au-delà de 30 consultations dans l'heure (409 nommé), puis rouvre après l'heure", async () => {
    await seed({ id: "send_1", minutesAgo: 1, outcome: "accepted" });
    for (let index = 0; index < MAIL_CONSULTATIONS_PER_HOUR; index += 1) {
      await reveal(staff(), "send_1").expect(204);
    }

    const refused = await reveal(staff(), "send_1").expect(409);
    expect(refused.text).toContain("plafond du suivi des e-mails");
    expect(await ctx.prisma.mailRecipientReveal.count()).toBe(MAIL_CONSULTATIONS_PER_HOUR);

    clock.advanceMs(60 * MINUTE + 1);
    await reveal(staff(), "send_1").expect(204);
  });

  it("le plafond compte aussi les recherches par adresse de la même personne", async () => {
    await seed({ id: "send_1", minutesAgo: 1, outcome: "accepted" });
    for (let index = 0; index < MAIL_CONSULTATIONS_PER_HOUR; index += 1) {
      await search(staff(), ADDRESS).expect(201);
    }

    await reveal(staff(), "send_1").expect(409);
    await search(staff(), ADDRESS).expect(409);
  });
});

describe("la recherche par adresse", () => {
  it("l'auteur lit les envois trouvés, masqués ; ni l'URL, ni le journal, ni les logs n'ont l'adresse", async () => {
    await seed({ id: "send_1", minutesAgo: 1, outcome: "accepted" });
    await seed({ id: "failed", minutesAgo: 9, outcome: "failed" });

    const created = await search(staff(), "  Colette@HALLES.fr ").expect(201);
    const { id } = jsonBody<MailRecipientSearchCreatedView>(created);
    const response = await staff().get(`${SENDS}/searches/${id}`).expect(200);
    const view = jsonBody<MailRecipientSearchView>(response);

    expect(view.items.map((item) => [item.id, item.recipient])).toEqual([
      ["failed", "c•••@halles.fr"],
      ["send_1", "c•••@halles.fr"],
    ]);
    expect(response.text).not.toContain(ADDRESS);
    expect(response.text).not.toContain("Resend a refusé");
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "mail.recipient_searched" },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ subjectId: id, payload: { found: 2 } });
    expect(JSON.stringify(facts)).not.toContain("halles");
    const stored = await ctx.prisma.mailRecipientSearch.findMany();
    expect(JSON.stringify(stored)).not.toContain("halles");
    expect(stored[0]?.recipientFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(logger.lines.join("\n")).not.toContain("halles.fr");
  });

  it("le résultat est figé à l'instant de la recherche", async () => {
    await seed({ id: "send_1", minutesAgo: 1, outcome: "accepted" });
    const { id } = jsonBody<MailRecipientSearchCreatedView>(
      await search(staff(), ADDRESS).expect(201),
    );
    await seed({ id: "later", minutesAgo: 0, outcome: "accepted" });

    const view = jsonBody<MailRecipientSearchView>(
      await staff().get(`${SENDS}/searches/${id}`).expect(200),
    );
    expect(view.items.map((item) => item.id)).toEqual(["send_1"]);
  });

  it("un collègue ne lit pas la recherche d'un autre (403), l'auteur plus après 5 minutes (403)", async () => {
    await seed({ id: "send_1", minutesAgo: 1, outcome: "accepted" });
    const bruno = await colleague("admin", "staff-bruno");
    const { id } = jsonBody<MailRecipientSearchCreatedView>(
      await search(staff(), ADDRESS).expect(201),
    );

    const refused = await bruno.get(`${SENDS}/searches/${id}`).expect(403);
    expect(refused.text).toContain("la personne qui l'a lancée");
    clock.advanceMs(5 * MINUTE);
    await staff().get(`${SENDS}/searches/${id}`).expect(403);
  });

  it("404 pour une recherche inconnue ; 400 pour une adresse mal formée ; 403 sans le droit", async () => {
    await staff().get(`${SENDS}/searches/absent`).expect(404);
    await search(staff(), "pas-une-adresse").expect(400);
    const support = await colleague("support", "staff-support");
    await search(support, ADDRESS).expect(403);
  });
});
