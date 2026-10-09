/**
 * E2E de **« Nous écrire »** (`documentation/order/plan-nous-ecrire.md`) — vrai
 * Postgres, mailer doublé.
 *
 * Ce que seul le vrai chemin prouve : qu'un visiteur sans jeton écrit
 * réellement (route `@Public`), que le message est RANGÉ puis envoyé à
 * l'adresse de son objet avec `Reply-To` = l'auteur, que le débit de la route
 * tient (3 par 10 minutes et par IP), que le piège n'écrit rien, et que le
 * staff marque traité une fois et une seule.
 */
import type {
  ContactMessageView,
  ContactSettingsPayload,
  ContactSubjectPayload,
  CreatedIdResponse,
  PublicContactSettingsView,
  PublicContactSubjectView,
} from "@lfd/contracts";
import { CONTACT_MIN_FILL_MS, DEFAULT_CONTACT_SETTINGS } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

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

const SUBJECT: ContactSubjectPayload = {
  label: { fr: "Une question sur ma commande", en: "About my order", it: "" },
  recipientEmail: "commandes@lfc.test",
  position: 0,
  active: true,
  audience: "both",
  priority: "medium",
};

async function createSubject(overrides: Partial<ContactSubjectPayload> = {}): Promise<string> {
  const response = await staff()
    .post("/admin/contact/subjects")
    .send({ ...SUBJECT, ...overrides })
    .expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

function message(
  subjectId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    subjectId,
    audience: "b2c",
    name: "Jean Martin",
    email: "jean@visiteur.test",
    phone: "",
    message: "Bonjour, ma commande est-elle prête ?",
    website: "",
    elapsedMs: CONTACT_MIN_FILL_MS + 4_000,
    ...overrides,
  };
}

async function pending(): Promise<ContactMessageView[]> {
  return jsonBody<ContactMessageView[]>(
    await staff().get("/admin/contact/messages?status=pending").expect(200),
  );
}

describe("un visiteur écrit", () => {
  it("le message est rangé, puis envoyé à l'adresse de l'objet, Reply-To = l'auteur", async () => {
    const subjectId = await createSubject();

    const offered = jsonBody<PublicContactSubjectView[]>(
      await visitor().get("/contact-subjects?audience=b2c").expect(200),
    );
    // L'adresse de destination ne sort pas vers la boutique.
    expect(offered).toEqual([{ id: subjectId, label: SUBJECT.label }]);

    await visitor().post("/contact-messages").send(message(subjectId)).expect(204);
    await ctx.drain();

    const [received] = await pending();
    expect(received).toMatchObject({
      subjectId,
      subjectLabel: "Une question sur ma commande",
      authorName: "Jean Martin",
      authorEmail: "jean@visiteur.test",
      userId: null,
      handledAt: null,
    });
    expect(sentMails).toEqual([
      expect.objectContaining({
        to: "commandes@lfc.test",
        replyTo: "jean@visiteur.test",
        template: "staff.contact-message",
      }),
    ]);
  });

  it("le champ piège rempli : 204, mais rien rangé ni envoyé", async () => {
    const subjectId = await createSubject();
    await visitor()
      .post("/contact-messages")
      .send(message(subjectId, { website: "https://spam.example" }))
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
      await visitor().get("/contact-subjects?audience=b2c").expect(200),
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

    expect((await pending())[0]).toMatchObject({ userId: user.id, companyId: null });
  });
});

describe("le staff traite", () => {
  it("marque traité une fois ; le second geste est refusé en nommant le cas", async () => {
    const subjectId = await createSubject();
    await visitor().post("/contact-messages").send(message(subjectId)).expect(204);
    await ctx.drain();
    const [received] = await pending();
    const id = received?.id ?? "";

    await staff().post(`/admin/contact/messages/${id}/handled`).expect(204);
    const second = await staff().post(`/admin/contact/messages/${id}/handled`).expect(409);
    expect(JSON.stringify(second.body)).toContain("contact.message.already_handled");

    expect(await pending()).toEqual([]);
    const handled = jsonBody<ContactMessageView[]>(
      await staff().get("/admin/contact/messages?status=handled").expect(200),
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
