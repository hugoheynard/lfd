/**
 * E2E des **textes des e-mails** (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, lot E2) :
 * l'écran, le brouillon à révision et le refus de variable (C5), « Publier »
 * en une transaction avec un fait avant/après, et le courriel envoyé APRÈS
 * publication qui porte le texte publié (C2). L'aperçu, l'essai et le mur :
 * `mail-copy-preview.e2e-spec.ts`.
 */
import type { MailCopyAdminView } from "@lfd/contracts";

import { E2E_STAFF_ID, jsonBody } from "./e2e-harness.js";
import { ADMIN, mailCopyScene, ORDER_PLACED } from "./mail-copy-scene.js";

const scene = mailCopyScene();
const { staff, draft, sendPasswordReset } = scene;

describe("l'écran des textes des e-mails", () => {
  it("liste les 31 e-mails, leurs textes, défaut et brouillon par langue", async () => {
    await draft("subject", "Merci pour {ref}");
    const view = jsonBody<MailCopyAdminView>(await staff().get(ADMIN).expect(200));

    expect(view.mails).toHaveLength(31);
    const placed = view.mails.find((mail) => mail.mail === ORDER_PLACED);
    expect(placed).toMatchObject({
      audience: "customer",
      family: "order",
      followsLocale: true,
      pendingCount: 1,
    });
    const subject = placed?.texts.find((text) => text.path === "subject");
    expect(subject).toMatchObject({
      variables: ["ref"],
      requiredVariables: ["ref"],
      staleTranslations: ["en", "it"],
    });
    expect(subject?.locales.fr).toMatchObject({
      default: "Votre commande {ref} — La Folie Coffee",
      draftState: "set",
      draftText: "Merci pour {ref}",
      revision: 1,
    });
    expect(view.pendingCount).toBe(1);
  });
});

describe("brouillon, refus, puis « Publier »", () => {
  it("refuse une variable obligatoire perdue (400) en listant les permises, et une inconnue", async () => {
    const lost = await staff()
      .put(`${ADMIN}/drafts`)
      .send({
        mail: ORDER_PLACED,
        path: "subject",
        locale: "fr",
        text: "Votre commande",
        expectedRevision: 0,
      })
      .expect(400);
    expect(jsonBody<{ readonly message: string }>(lost).message).toContain(
      "Variables permises : {ref}.",
    );
    await staff()
      .put(`${ADMIN}/drafts`)
      .send({
        mail: ORDER_PLACED,
        path: "subject",
        locale: "fr",
        text: "{ref} {total}",
        expectedRevision: 0,
      })
      .expect(400);
    await staff()
      .put(`${ADMIN}/drafts`)
      .send({
        mail: ORDER_PLACED,
        path: "pas.un.texte",
        locale: "fr",
        text: "x",
        expectedRevision: 0,
      })
      .expect(404);
    expect(await scene.ctx().prisma.mailCopyEntry.count()).toBe(0);
  });

  it("409 quand quelqu'un a écrit le texte entre-temps", async () => {
    await draft("subject", "Merci {ref}");
    await staff()
      .put(`${ADMIN}/drafts`)
      .send({
        mail: ORDER_PLACED,
        path: "subject",
        locale: "fr",
        text: "Autre {ref}",
        expectedRevision: 0,
      })
      .expect(409);
  });

  it("publie en une version, avec un fait avant/après ; rétablir le défaut le retire", async () => {
    await draft("subject", "Merci pour {ref}");
    expect((await staff().post(`${ADMIN}/publications`).expect(201)).body).toEqual({ version: 1 });
    await staff()
      .post(`${ADMIN}/resets`)
      .send({ mail: ORDER_PLACED, path: "subject", locale: "fr", expectedRevision: 1 })
      .expect(204);
    await staff().post(`${ADMIN}/publications`).expect(201);

    const facts = await scene.ctx().prisma.activityEvent.findMany({
      where: { type: "mail_copy.published" },
      orderBy: { id: "asc" },
    });
    expect(facts.map((fact) => fact.payload)).toEqual([
      {
        subjectLabel: "Textes des e-mails",
        version: 1,
        changes: [
          {
            mail: ORDER_PLACED,
            path: "subject",
            locale: "fr",
            before: null,
            after: "Merci pour {ref}",
          },
        ],
      },
      {
        subjectLabel: "Textes des e-mails",
        version: 2,
        changes: [
          {
            mail: ORDER_PLACED,
            path: "subject",
            locale: "fr",
            before: "Merci pour {ref}",
            after: null,
          },
        ],
      },
    ]);
    expect(facts[0]?.actorId).toBe(E2E_STAFF_ID);
  });

  it("refuse en 409 de publier sans brouillon, sans rien écrire", async () => {
    await staff().post(`${ADMIN}/publications`).expect(409);
    expect(await scene.ctx().prisma.mailCopyPublication.count()).toBe(0);
  });
});

describe("le courriel envoyé porte le texte effectif (C2)", () => {
  it("le défaut avant publication ; le texte publié après — pas le brouillon avant", async () => {
    const before = await sendPasswordReset();
    const defaultSubject = before?.subject ?? "";
    expect(defaultSubject).not.toBe("");

    await staff()
      .put(`${ADMIN}/drafts`)
      .send({
        mail: "customer.password-reset",
        path: "subject",
        locale: "fr",
        text: "Votre nouveau mot de passe — texte publié",
        expectedRevision: 0,
      })
      .expect(204);
    expect((await sendPasswordReset())?.subject).toBe(defaultSubject);

    await staff().post(`${ADMIN}/publications`).expect(201);
    const after = await sendPasswordReset();
    expect(after?.subject).toBe("Votre nouveau mot de passe — texte publié");
    expect(after?.to).toBe("client@exemple.invalid");
  });
});
