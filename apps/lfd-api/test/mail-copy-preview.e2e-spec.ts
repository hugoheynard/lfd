/**
 * E2E de **l'aperçu et de l'essai** des textes des e-mails (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, C6, C7) :
 * l'aperçu rend le vrai gabarit sans rien écrire ni envoyer, l'essai part à
 * la seule adresse de l'appelant, et le mur `b2b_storefront` tient les deux.
 */
import { E2E_STAFF_EMAIL, E2E_STAFF_ID } from "./e2e-harness.js";
import { ADMIN, mailCopyScene, ORDER_PLACED } from "./mail-copy-scene.js";

const scene = mailCopyScene();
const { staff, draft, preview, transport } = scene;
const ctx = scene.ctx;

describe("l'aperçu et l'essai (C6)", () => {
  it("l'aperçu rend le vrai gabarit, brouillon ou publié, sans écrire ni envoyer", async () => {
    await draft("subject", "Aperçu {ref}");
    const factsBefore = await ctx().prisma.activityEvent.count();

    const drafted = await preview("draft");
    const published = await preview("published");

    expect(drafted.subject).toBe("Aperçu EXEMPLE-0001");
    expect(published.subject).toBe("Votre commande EXEMPLE-0001 — La Folie Coffee");
    expect(drafted.html).toContain("EXEMPLE");
    expect(drafted.html).not.toContain("cid:");
    expect(drafted.attachments.some((attachment) => attachment.inline)).toBe(true);
    expect(transport.sent).toEqual([]);
    expect(await ctx().prisma.activityEvent.count()).toBe(factsBefore);
    await staff().get(`${ADMIN}/previews?mail=pas.un.mail&locale=fr`).expect(404);
  });

  it("l'essai part à l'adresse de l'appelant, et à elle seule, avec le brouillon ; il se trace", async () => {
    await draft("subject", "Essai {ref}");
    await staff()
      .post(`${ADMIN}/trials`)
      .send({ mail: ORDER_PLACED, locale: "fr", source: "draft", to: "tiers@exemple.invalid" })
      .expect(204);

    expect(transport.sent.map((sent) => [sent.to, sent.template, sent.subject])).toEqual([
      [E2E_STAFF_EMAIL, ORDER_PLACED, "Essai EXEMPLE-0001"],
    ]);
    const fact = await ctx().prisma.activityEvent.findFirstOrThrow({
      where: { type: "mail_copy.trial_sent" },
    });
    expect(fact.payload).toEqual({
      subjectLabel: ORDER_PLACED,
      mail: ORDER_PLACED,
      locale: "fr",
      source: "draft",
    });
    expect(fact.actorId).toBe(E2E_STAFF_ID);
  });
});

describe("le mur : `b2b_storefront`", () => {
  async function person(role: "communication" | "commercial"): Promise<string> {
    const sub = `staff-${role}`;
    await ctx().prisma.staffUser.create({
      data: {
        id: `fiche-${role}`,
        firstName: "Fiche",
        lastName: role,
        email: `${role}@lfc.test`,
        role,
        status: "active",
        auth0Id: sub,
      },
    });
    return sub;
  }

  it("la communication lit, écrit, prévisualise et s'envoie un essai", async () => {
    const sub = await person("communication");
    await ctx().asSub(sub).get(ADMIN).expect(200);
    await ctx().asSub(sub).get(`${ADMIN}/previews?mail=${ORDER_PLACED}&locale=fr`).expect(200);
    await ctx()
      .asSub(sub)
      .post(`${ADMIN}/trials`)
      .send({ mail: ORDER_PLACED, locale: "fr" })
      .expect(204);
    expect(transport.sent.map((sent) => sent.to)).toEqual(["communication@lfc.test"]);
  });

  it("le commercial ne voit rien, n'écrit rien, n'envoie rien", async () => {
    const sub = await person("commercial");
    await ctx().asSub(sub).get(ADMIN).expect(403);
    await ctx().asSub(sub).get(`${ADMIN}/previews?mail=${ORDER_PLACED}&locale=fr`).expect(403);
    await ctx()
      .asSub(sub)
      .put(`${ADMIN}/drafts`)
      .send({
        mail: ORDER_PLACED,
        path: "subject",
        locale: "fr",
        text: "{ref}",
        expectedRevision: 0,
      })
      .expect(403);
    await ctx().asSub(sub).post(`${ADMIN}/publications`).expect(403);
    await ctx()
      .asSub(sub)
      .post(`${ADMIN}/trials`)
      .send({ mail: ORDER_PLACED, locale: "fr" })
      .expect(403);
    expect(transport.sent).toEqual([]);
  });

  it("sans jeton, 401", async () => {
    await ctx().http().get(ADMIN).expect(401);
  });
});
