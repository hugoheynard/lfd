/**
 * E2E de **« Nous écrire »**, une demande `contact`
 * (`documentation/contenu-ecommerce/demandes-clients.md`) — vrai
 * Postgres, mailer doublé.
 *
 * Ce que seul le vrai chemin prouve : qu'un visiteur sans jeton écrit
 * réellement (route `@Public`), que le message est RANGÉ puis envoyé à
 * l'adresse de son motif avec `Reply-To` = l'auteur, que le débit de la route
 * tient (3 par 10 minutes et par IP), que le piège n'écrit rien, et que le
 * staff marque traité une fois et une seule.
 */
import type {
  ContactSettingsPayload,
  CreatedIdResponse,
  CustomerRequestView,
  PublicContactSettingsView,
  PublicRequestReasonView,
  RequestReasonPayload,
} from "@lfd/contracts";
import { DEFAULT_CONTACT_SETTINGS } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { attachTo, createCompany, createUser } from "./factories.js";

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly replyTo?: string;
  readonly data: unknown;
}
const sentMails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MAILER, value: recordingMailer },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  sentMails.splice(0);
});

/**
 * Une IP par appelant : le compteur du débit vit en mémoire pour toute la
 * suite, et deux tests qui partageraient une IP se voleraient leurs essais.
 */
let ipSeq = 0;
function visitor(): ReturnType<E2eContext["http"]> {
  ipSeq += 1;
  return ctx.http().set("x-lfc-client-ip", `203.0.113.${String(ipSeq)}`);
}

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

const SUBJECT: RequestReasonPayload = {
  kind: "contact",
  label: { fr: "Une question sur ma commande", en: "About my order", it: "" },
  recipientEmail: "commandes@lfc.test",
  position: 0,
  active: true,
  audience: "both",
  priority: "medium",
};

async function createSubject(overrides: Partial<RequestReasonPayload> = {}): Promise<string> {
  const response = await staff()
    .post("/admin/request-reasons")
    .send({ ...SUBJECT, ...overrides })
    .expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

function message(
  subjectId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    reasonId: subjectId,
    name: "Jean Martin",
    email: "jean@visiteur.test",
    phone: "",
    message: "Bonjour, ma commande est-elle prête ?",
    lfd_trap: "",
    ...overrides,
  };
}

async function pending(): Promise<CustomerRequestView[]> {
  return jsonBody<CustomerRequestView[]>(
    await staff().get("/admin/customer-requests?status=pending").expect(200),
  );
}

describe("un visiteur écrit", () => {
  it("le message est rangé, puis envoyé à l'adresse de l'objet, Reply-To = l'auteur", async () => {
    const subjectId = await createSubject();

    const offered = jsonBody<PublicRequestReasonView[]>(
      await visitor().get("/request-reasons?kind=contact&audience=b2c").expect(200),
    );
    // L'adresse de destination ne sort pas vers la boutique.
    expect(offered).toEqual([{ id: subjectId, label: SUBJECT.label }]);

    await visitor().post("/contact-messages").send(message(subjectId)).expect(204);
    await ctx.drain();

    const [received] = await pending();
    expect(received).toMatchObject({
      kind: "contact",
      reasonId: subjectId,
      reasonLabel: "Une question sur ma commande",
      details: { kind: "contact" },
      authorName: "Jean Martin",
      authorEmail: "jean@visiteur.test",
      userId: null,
      handledAt: null,
    });
    expect(sentMails).toEqual([
      expect.objectContaining({
        to: "commandes@lfc.test",
        replyTo: "jean@visiteur.test",
        template: "staff.customer-request",
      }),
    ]);
  });

  it("le champ piège rempli : 204, mais rien rangé ni envoyé", async () => {
    const subjectId = await createSubject();
    await visitor()
      .post("/contact-messages")
      .send(message(subjectId, { lfd_trap: "https://spam.example" }))
      .expect(204);
    await ctx.drain();

    expect(await pending()).toEqual([]);
    expect(sentMails).toEqual([]);
  });

  it("un objet réservé aux pros est refusé à un particulier", async () => {
    const subjectId = await createSubject({ audience: "b2b" });
    await visitor().post("/contact-messages").send(message(subjectId)).expect(409);
    expect(await pending()).toEqual([]);
  });

  it("le débit : le quatrième message en dix minutes depuis la même IP est refusé", async () => {
    const subjectId = await createSubject();
    const sameIp = visitor();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await sameIp.post("/contact-messages").send(message(subjectId)).expect(204);
    }
    await sameIp.post("/contact-messages").send(message(subjectId)).expect(429);
    await ctx.drain();
    expect(await pending()).toHaveLength(3);
  });
});

describe("la priorité, à usage interne", () => {
  it("n'est jamais servie à la boutique ; « à traiter » met l'urgent d'abord", async () => {
    const calm = await createSubject({ priority: "low" });
    const hot = await createSubject({ priority: "urgent", position: 1 });
    const offered = jsonBody<Record<string, unknown>[]>(
      await visitor().get("/request-reasons?kind=contact&audience=b2c").expect(200),
    );
    expect(offered.every((subject) => !("priority" in subject))).toBe(true);

    await visitor().post("/contact-messages").send(message(calm)).expect(204);
    await visitor().post("/contact-messages").send(message(hot)).expect(204);
    await ctx.drain();

    expect((await pending()).map((received) => received.priority)).toEqual(["urgent", "low"]);
    expect(sentMails.map((mail) => mail.template)).toHaveLength(2);
  });
});

describe("un client connecté écrit", () => {
  it("sa personne est rangée avec le message — prise au jeton, pas au corps", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: "auth0|contact-client" });
    const subjectId = await createSubject();
    await ctx
      .asSub("auth0|contact-client")
      .set("x-lfc-client-ip", "198.51.100.7")
      .post("/me/contact-messages")
      .send(message(subjectId))
      .expect(204);
    await ctx.drain();

    expect((await pending())[0]).toMatchObject({
      userId: user.id,
      companyId: null,
      audience: "b2c",
    });
  });

  it("le public se déduit du principal : une société active ouvre l'objet pro, le corps n'y peut rien", async () => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: "auth0|contact-pro" });
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
    await createUser(ctx.prisma, { auth0Sub: "auth0|contact-perso" });
    const proOnly = await createSubject({ audience: "b2b" });

    await ctx
      .asSub("auth0|contact-pro")
      .set("x-lfc-client-ip", "198.51.100.8")
      .post("/me/contact-messages")
      .send(message(proOnly))
      .expect(204);
    // Un `audience` au corps n'est plus un champ du contrat : refusé à la forme.
    await ctx
      .asSub("auth0|contact-perso")
      .set("x-lfc-client-ip", "198.51.100.9")
      .post("/me/contact-messages")
      .send(message(proOnly, { audience: "b2b" }))
      .expect(400);
    await ctx
      .asSub("auth0|contact-perso")
      .set("x-lfc-client-ip", "198.51.100.10")
      .post("/me/contact-messages")
      .send(message(proOnly))
      .expect(409);
    await ctx.drain();

    expect(await pending()).toEqual([
      expect.objectContaining({ companyId: company.id, audience: "b2b" }),
    ]);
  });
});

describe("le staff traite", () => {
  it("marque traité une fois ; le second geste est refusé en nommant le cas", async () => {
    const subjectId = await createSubject();
    await visitor().post("/contact-messages").send(message(subjectId)).expect(204);
    await ctx.drain();
    const [received] = await pending();
    const id = received?.id ?? "";

    await staff().post(`/admin/customer-requests/${id}/handled`).expect(204);
    const second = await staff().post(`/admin/customer-requests/${id}/handled`).expect(409);
    expect(JSON.stringify(second.body)).toContain("contact.request.already_handled");

    expect(await pending()).toEqual([]);
    const handled = jsonBody<CustomerRequestView[]>(
      await staff().get("/admin/customer-requests?status=handled").expect(200),
    );
    expect(handled).toHaveLength(1);
    expect(handled[0]?.handledAt).not.toBeNull();
  });

  it("la carte de contact posée par le staff est servie à la boutique", async () => {
    const empty = jsonBody<PublicContactSettingsView>(
      await visitor().get("/contact-settings").expect(200),
    );
    expect(empty).toEqual({ phones: [], cards: DEFAULT_CONTACT_SETTINGS.cards });

    const payload: ContactSettingsPayload = {
      cards: {
        ...DEFAULT_CONTACT_SETTINGS.cards,
        b2b: {
          kicker: { fr: "Votre commercial", en: "Your sales rep", it: "" },
          title: { fr: "Une question pro ?", en: "", it: "" },
          body: { fr: "Votre commercial vous répond.", en: "", it: "" },
        },
      },
    };
    await staff().put("/admin/contact/settings").send(payload).expect(204);

    const shop = { label: { fr: "Boutique de Val d'Isère", en: "", it: "" }, audience: "b2c" };
    await staff()
      .post("/admin/contact/phones")
      .send({ ...shop, number: "04 79 00 00 00", position: 1, active: true })
      .expect(201);
    const archived = jsonBody<CreatedIdResponse>(
      await staff()
        .post("/admin/contact/phones")
        .send({ ...shop, number: "04 79 11 11 11", position: 0, active: true })
        .expect(201),
    ).id;
    await staff().post(`/admin/contact/phones/${archived}/archive`).expect(204);
    await staff()
      .post("/admin/contact/phones")
      .send({ ...shop, number: "pas un numéro", position: 2, active: true })
      .expect(400);

    expect(
      jsonBody<PublicContactSettingsView>(await visitor().get("/contact-settings").expect(200)),
    ).toEqual({ cards: payload.cards, phones: [{ ...shop, number: "04 79 00 00 00" }] });
  });
});

describe("l'anonymisation à douze mois", () => {
  it("vide un traité il y a plus d'un an ET un jamais traité reçu il y a plus d'un an — pas les récents", async () => {
    const subjectId = await createSubject();
    for (let index = 0; index < 4; index += 1) {
      await visitor().post("/contact-messages").send(message(subjectId)).expect(204);
    }
    await ctx.drain();
    const [oldHandled, oldPending, recentHandled, recentPending] = (await pending()).map(
      (received) => received.id,
    );
    const yearAndMore = new Date(daysAgo(400));
    const recent = new Date(daysAgo(30));
    // Les dates sont posées en base : l'API n'écrit qu'à l'instant présent.
    await ctx.prisma.customerRequest.update({
      where: { id: oldHandled ?? "" },
      data: {
        receivedAt: yearAndMore,
        handledAt: yearAndMore,
        handledByStaffId: "s",
        handledByName: "S",
      },
    });
    await ctx.prisma.customerRequest.update({
      where: { id: oldPending ?? "" },
      data: { receivedAt: yearAndMore },
    });
    await ctx.prisma.customerRequest.update({
      where: { id: recentHandled ?? "" },
      data: {
        receivedAt: yearAndMore,
        handledAt: recent,
        handledByStaffId: "s",
        handledByName: "S",
      },
    });

    const report = await ctx
      .http()
      .post("/admin/contact/messages/anonymization/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    expect(report.body).toEqual({ anonymized: 2 });

    const rows = await ctx.prisma.customerRequest.findMany({
      select: { id: true, authorEmail: true, body: true, anonymizedAt: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const id of [oldHandled, oldPending]) {
      expect(byId.get(id ?? "")).toMatchObject({ authorEmail: "", body: "" });
      expect(byId.get(id ?? "")?.anonymizedAt).not.toBeNull();
    }
    for (const id of [recentHandled, recentPending]) {
      expect(byId.get(id ?? "")).toMatchObject({
        authorEmail: "jean@visiteur.test",
        anonymizedAt: null,
      });
    }
  });
});

describe("les motifs par formulaire (§6.5)", () => {
  it("un motif `order_problem` n'est ni proposé à « Nous écrire », ni accepté par lui", async () => {
    const problem = await createSubject({ kind: "order_problem" });
    const contact = await createSubject();
    const offered = jsonBody<PublicRequestReasonView[]>(
      await visitor().get("/request-reasons?kind=contact&audience=b2c").expect(200),
    );
    expect(offered.map((reason) => reason.id)).toEqual([contact]);
    await visitor().post("/contact-messages").send(message(problem)).expect(409);

    const tab = await staff().get("/admin/request-reasons?kind=order_problem").expect(200);
    expect(jsonBody<{ id: string }[]>(tab).map((reason) => reason.id)).toEqual([problem]);
  });

  it("le type d'un motif ne change pas à la révision", async () => {
    const contact = await createSubject();
    const refused = await staff()
      .put(`/admin/request-reasons/${contact}`)
      .send({ ...SUBJECT, kind: "order_problem" })
      .expect(400);
    expect(JSON.stringify(refused.body)).toContain("contact.reason.kind_immutable");
  });
});
