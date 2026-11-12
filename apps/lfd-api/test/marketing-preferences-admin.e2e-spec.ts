/**
 * E2E du **registre de préférence marketing vu par le staff** (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, règle 8, lot C4) :
 * le droit `mail_sends`, la liste masquée et filtrée par pages, la preuve au
 * détail, « Afficher l'adresse » par la révélation tracée du suivi (même
 * table, même plafond, fait au journal), la désinscription par le staff
 * (source `staff`, fait au journal avec son auteur), et aucune route de
 * réinscription.
 *
 * Les lignes sont posées par le canal du bloc (`MarketingConsent`) — le
 * chemin même de la boutique — sur la vraie base.
 */
import type {
  MailPreferenceDetailView,
  MailPreferenceListView,
  MailPreferenceRecipientView,
  MailPreferenceSearchCreatedView,
  MailPreferenceSearchView,
  MailSendListView,
} from "@lfd/contracts";

import { MarketingConsent } from "../src/mail/channels/marketing/marketing-consent.js";
import { MailRequest } from "../src/mail/requests/domain/entities/mail-request.js";
import { MailRequestRepository } from "../src/mail/requests/domain/ports/mail-request.repository.js";
import { MailConsultationPruner } from "../src/mail/sends/domain/ports/mail-consultation.pruner.js";
import { MAIL_CONSULTATIONS_PER_HOUR } from "../src/mail/sends/domain/entities/staff-mail-consultations.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const MINUTE = 60_000;
const PREFERENCES = "/admin/mail/preferences";
const ADDRESS = "colette@halles.fr";
const OTHER = "bruno@halles.fr";
const clock = new FixedClock(new Date());
let ctx: E2eContext;
let consent: MarketingConsent;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: Clock, value: clock },
    ],
  });
  consent = ctx.app.get(MarketingConsent);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  clock.set(new Date());
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

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

/** Un accord confirmé (adresse vérifiée), recueilli à la commande. */
async function accepted(address: string): Promise<string> {
  await consent.request("lfc", address, {
    textVersion: "society.v1",
    locale: "it",
    where: "order",
    ref: "order_e2e",
    verified: true,
  });
  return idOf(address);
}

async function idOf(address: string): Promise<string> {
  const row = await ctx.prisma.mailMarketingPreference.findFirstOrThrow({
    where: { recipientKey: address },
    select: { id: true },
  });
  return row.id;
}

async function list(query = ""): Promise<MailPreferenceListView> {
  const response = await staff().get(`${PREFERENCES}${query}`).expect(200);
  return jsonBody<MailPreferenceListView>(response);
}

describe("le droit `mail_sends`", () => {
  it("sans le droit, la liste, le détail, la révélation et la désinscription sont refusés (403)", async () => {
    const id = await accepted(ADDRESS);
    const support = await colleague("support", "staff-support");

    await support.get(PREFERENCES).expect(403);
    await support.get(`${PREFERENCES}/${id}`).expect(403);
    await support
      .post(`${PREFERENCES}/${id}/recipient-reveal`)
      .set(INTENT_KEY, freshIntent())
      .expect(403);
    await support.post(`${PREFERENCES}/${id}/unsubscription`).expect(403);
    await support
      .post(`${PREFERENCES}/unsubscriptions`)
      .send({ space: "lfc", address: ADDRESS })
      .expect(403);
    expect(await ctx.prisma.mailPreferenceConsultation.count()).toBe(0);
    const row = await ctx.prisma.mailMarketingPreference.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("accepted");
  });
});

describe("la liste et le détail", () => {
  it("masque l'adresse partout, filtre par espace et par état, pagine par curseur", async () => {
    const first = await accepted(ADDRESS);
    const second = await accepted(OTHER);
    await consent.unsubscribe("lfc", "zoe@halles.fr", "link");

    const page = await list("?limit=2");
    const rest = await list(`?limit=2&cursor=${encodeURIComponent(page.nextCursor ?? "")}`);
    const unsubscribed = await list("?space=lfc&status=unsubscribed");
    const elsewhere = await list("?space=lfd");

    expect([...page.items, ...rest.items].map((item) => item.recipient).sort()).toEqual([
      "b•••@halles.fr",
      "c•••@halles.fr",
      "z•••@halles.fr",
    ]);
    expect(rest.nextCursor).toBeNull();
    expect(unsubscribed.items.map((item) => [item.status, item.unsubscribedSource])).toEqual([
      ["unsubscribed", "link"],
    ]);
    expect(elsewhere.items).toEqual([]);
    expect(JSON.stringify([page, rest])).not.toContain(ADDRESS);
    expect([first, second]).toHaveLength(2);
  });

  it("sert la preuve au détail, adresse masquée ; une adresse en paramètre est refusée", async () => {
    const id = await accepted(ADDRESS);

    const response = await staff().get(`${PREFERENCES}/${id}`).expect(200);
    const view = jsonBody<MailPreferenceDetailView>(response);

    expect(view).toMatchObject({
      status: "accepted",
      origin: "direct",
      place: "order",
      recipient: "c•••@halles.fr",
      proof: { textVersion: "society.v1", locale: "it", place: "order", ref: "order_e2e" },
    });
    expect(view.confirmedAt).not.toBeNull();
    expect(JSON.stringify(view)).not.toContain(ADDRESS);
    await staff()
      .get(`${PREFERENCES}?address=${encodeURIComponent(ADDRESS)}`)
      .expect(400);
    await staff().get(`${PREFERENCES}/absent`).expect(404);
  });
});

describe("« Afficher l'adresse » — une révélation par ligne", () => {
  it("range la révélation de la ligne, publie le fait sans adresse, sert l'adresse 5 minutes à son seul auteur", async () => {
    const id = await accepted(ADDRESS);
    const colleagueAgent = await colleague("admin", "staff-colleague");

    await staff().get(`${PREFERENCES}/${id}/recipient`).expect(403);
    await staff()
      .post(`${PREFERENCES}/${id}/recipient-reveal`)
      .set(INTENT_KEY, freshIntent())
      .expect(204);
    const response = await staff().get(`${PREFERENCES}/${id}/recipient`).expect(200);

    expect(jsonBody<MailPreferenceRecipientView>(response).recipient).toBe(ADDRESS);
    await colleagueAgent.get(`${PREFERENCES}/${id}/recipient`).expect(403);
    const consultations = await ctx.prisma.mailPreferenceConsultation.findMany();
    expect(consultations.map((row) => [row.kind, row.preferenceId, row.fingerprint])).toEqual([
      ["reveal", id, null],
    ]);
    expect(await ctx.prisma.mailRecipientSearch.count()).toBe(0);
    expect(await ctx.prisma.mailRecipientReveal.count()).toBe(0);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "mail.preference_recipient_revealed" },
    });
    expect(facts.map((fact) => [fact.subjectType, fact.subjectId])).toEqual([
      ["mail_marketing_preference", id],
    ]);
    expect(JSON.stringify([facts, consultations])).not.toContain(ADDRESS);

    clock.set(new Date(clock.now().getTime() + 5 * MINUTE));
    await staff().get(`${PREFERENCES}/${id}/recipient`).expect(403);
  });

  it("est découplée du suivi : chercher l'adresse au suivi n'ouvre pas la ligne", async () => {
    const id = await accepted(ADDRESS);

    await staff()
      .post("/admin/mail/sends/searches")
      .set(INTENT_KEY, freshIntent())
      .send({ address: ADDRESS })
      .expect(201);

    await staff().get(`${PREFERENCES}/${id}/recipient`).expect(403);
  });

  it("partage le plafond du suivi dans les deux sens : au-delà de 30 consultations dans l'heure, 409", async () => {
    const id = await accepted(ADDRESS);
    await MailRequestRepositorySeed.one();
    for (let index = 0; index < MAIL_CONSULTATIONS_PER_HOUR - 1; index += 1) {
      await staff()
        .post("/admin/mail/sends/send_1/recipient-reveal")
        .set(INTENT_KEY, freshIntent())
        .expect(204);
    }
    await staff()
      .post(`${PREFERENCES}/${id}/recipient-reveal`)
      .set(INTENT_KEY, freshIntent())
      .expect(204);

    await staff()
      .post(`${PREFERENCES}/${id}/recipient-reveal`)
      .set(INTENT_KEY, freshIntent())
      .expect(409);
    await staff()
      .post(`${PREFERENCES}/searches`)
      .set(INTENT_KEY, freshIntent())
      .send({ address: ADDRESS })
      .expect(409);
    await staff()
      .post("/admin/mail/sends/send_1/recipient-reveal")
      .set(INTENT_KEY, freshIntent())
      .expect(409);
    expect(await ctx.prisma.mailPreferenceConsultation.count()).toBe(1);
  });
});

describe("la recherche par adresse du registre", () => {
  it("range l'empreinte et les lignes trouvées, sans adresse, et sert le résultat masqué à son seul auteur", async () => {
    const id = await accepted(ADDRESS);
    await accepted(OTHER);
    const colleagueAgent = await colleague("admin", "staff-colleague");

    const created = await staff()
      .post(`${PREFERENCES}/searches`)
      .set(INTENT_KEY, freshIntent())
      .send({ address: ` ${ADDRESS.toUpperCase()} ` })
      .expect(201);
    const searchId = jsonBody<MailPreferenceSearchCreatedView>(created).id;
    const response = await staff().get(`${PREFERENCES}/searches/${searchId}`).expect(200);
    const view = jsonBody<MailPreferenceSearchView>(response);

    expect(view.items.map((item) => [item.id, item.recipient])).toEqual([[id, "c•••@halles.fr"]]);
    const stored = await ctx.prisma.mailPreferenceConsultation.findMany({
      include: { hits: true },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.kind).toBe("search");
    expect(stored[0]?.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(stored[0]?.hits.map((hit) => hit.preferenceId)).toEqual([id]);
    expect(await ctx.prisma.mailRecipientSearch.count()).toBe(0);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "mail.preference_recipient_searched" },
    });
    expect(facts.map((fact) => fact.payload)).toEqual([{ found: 1 }]);
    expect(JSON.stringify([facts, stored, view])).not.toContain(ADDRESS);

    await colleagueAgent.get(`${PREFERENCES}/searches/${searchId}`).expect(403);
    clock.set(new Date(clock.now().getTime() + 5 * MINUTE));
    await staff().get(`${PREFERENCES}/searches/${searchId}`).expect(403);
    await staff().get(`${PREFERENCES}/searches/absent`).expect(404);
  });

  it("refuse une adresse sans @, sans rien ranger ; une adresse en URL n'est pas admise", async () => {
    await staff()
      .post(`${PREFERENCES}/searches`)
      .set(INTENT_KEY, freshIntent())
      .send({ address: "colette" })
      .expect(400);
    await staff()
      .post(`${PREFERENCES}/searches`)
      .set(INTENT_KEY, freshIntent())
      .send({})
      .expect(400);
    expect(await ctx.prisma.mailPreferenceConsultation.count()).toBe(0);
  });
});

describe("la purge des consultations (1 an, même cran que le suivi)", () => {
  it("compte et supprime les consultations du registre, lignes trouvées comprises", async () => {
    const id = await accepted(ADDRESS);
    await staff()
      .post(`${PREFERENCES}/${id}/recipient-reveal`)
      .set(INTENT_KEY, freshIntent())
      .expect(204);
    await staff()
      .post(`${PREFERENCES}/searches`)
      .set(INTENT_KEY, freshIntent())
      .send({ address: ADDRESS })
      .expect(201);
    const pruner = ctx.app.get(MailConsultationPruner);
    const after = new Date(clock.now().getTime() + MINUTE);

    expect((await pruner.census(clock.now())).count).toBe(0);
    expect((await pruner.census(after)).count).toBe(2);
    expect(await pruner.pruneBatch(after, 10)).toBe(2);
    expect(await ctx.prisma.mailPreferenceConsultation.count()).toBe(0);
    expect(await ctx.prisma.mailPreferenceConsultationHit.count()).toBe(0);
  });
});

describe("« Désinscrire à la demande du client »", () => {
  it("désinscrit la ligne (source `staff`), trace l'auteur, et l'e-mail marketing ne lui part plus", async () => {
    const id = await accepted(ADDRESS);

    await staff().post(`${PREFERENCES}/${id}/unsubscription`).expect(204);
    await staff().post(`${PREFERENCES}/${id}/unsubscription`).expect(204);

    const row = await ctx.prisma.mailMarketingPreference.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "unsubscribed", unsubscribedSource: "staff" });
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "mail.marketing_unsubscribed_by_staff" },
      orderBy: { occurredAt: "asc" },
    });
    expect(facts.map((fact) => [fact.subjectId, fact.payload])).toEqual([
      [id, { space: "lfc", changed: true }],
      [id, { space: "lfc", changed: false }],
    ]);
    expect(facts.every((fact) => fact.actorType === "staff" && fact.actorId !== null)).toBe(true);
    expect(JSON.stringify(facts)).not.toContain("@");
  });

  it("désinscrit une adresse donnée dans le corps, même inconnue du registre", async () => {
    await staff()
      .post(`${PREFERENCES}/unsubscriptions`)
      .send({ space: "lfc", address: " Nouveau@Halles.fr " })
      .expect(204);
    await staff()
      .post(`${PREFERENCES}/unsubscriptions`)
      .send({ space: "lfc", address: "sans-arobase" })
      .expect(400);

    const rows = await ctx.prisma.mailMarketingPreference.findMany();
    expect(rows.map((row) => [row.recipientKey, row.status, row.unsubscribedSource])).toEqual([
      ["nouveau@halles.fr", "unsubscribed", "staff"],
    ]);
  });

  it("n'offre aucune route de réinscription", async () => {
    const id = await accepted(ADDRESS);
    await staff().post(`${PREFERENCES}/${id}/unsubscription`).expect(204);

    for (const path of ["resubscription", "subscription", "acceptance", "consent"]) {
      await staff().post(`${PREFERENCES}/${id}/${path}`).expect(404);
    }
    await staff().put(`${PREFERENCES}/${id}`).send({ status: "accepted" }).expect(404);
    await staff().patch(`${PREFERENCES}/${id}`).send({ status: "accepted" }).expect(404);
    const row = await ctx.prisma.mailMarketingPreference.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("unsubscribed");
  });
});

describe("le suivi des envois (U4)", () => {
  it("filtre les envois refusés par leur raison fermée", async () => {
    await MailRequestRepositorySeed.refused("send_u", "unsubscribed");
    await MailRequestRepositorySeed.refused("send_n", "no_consent");

    const response = await staff().get("/admin/mail/sends?refusal=unsubscribed").expect(200);
    const view = jsonBody<MailSendListView>(response);

    expect(view.items.map((item) => [item.id, item.refusalCode])).toEqual([
      ["send_u", "unsubscribed"],
    ]);
  });
});

/** Les demandes d'e-mail, posées par l'agrégat et rangées par son dépôt. */
const MailRequestRepositorySeed = {
  async one(): Promise<void> {
    const request = MailRequest.request({
      id: "send_1",
      template: "customer.access-opened",
      brand: "lfc",
      recipient: OTHER,
      locale: "fr",
      idempotencyKey: "e2e:send_1",
      requestedAt: clock.now(),
    });
    request.markSent("re_send_1", clock.now(), 1);
    await ctx.app.get(MailRequestRepository).save(request);
  },
  async refused(id: string, code: "unsubscribed" | "no_consent"): Promise<void> {
    const request = MailRequest.request({
      id,
      template: "customer.access-opened",
      brand: "lfc",
      recipient: OTHER,
      locale: "fr",
      idempotencyKey: `e2e:${id}`,
      requestedAt: clock.now(),
    });
    request.markRefusedFor(code, clock.now());
    await ctx.app.get(MailRequestRepository).save(request);
  },
};
