/**
 * E2E du signal « le texte d'origine a changé depuis la modification »
 * (décision de Hugo, 2026-10-23 — plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md` §2 quinquies).
 *
 * Deux démarrages sur la MÊME base : le premier avec le dictionnaire compilé,
 * où l'on modifie et publie ; le second avec un manifeste dont le texte du
 * code a été réécrit (surcharge du provider, le fichier n'est pas touché) —
 * c'est le déploiement d'après. Le signal apparaît, « Rétablir » le retire.
 */
import type { MailCopyAdminView, MailCopyLocaleView } from "@lfd/contracts";

import { MailCopyManifest } from "../src/b2b/mail-copy/domain/mail-copy-manifest.js";
import { embeddedMailCopyManifest } from "../src/b2b/mail-copy/infrastructure/embedded-mail-copy-manifest.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { ADMIN, ORDER_PLACED } from "./mail-copy-scene.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const COMPILED = embeddedMailCopyManifest();
const PREVIOUS = COMPILED.entry(ORDER_PLACED, "subject")?.defaults.fr ?? "";
const REWRITTEN = embeddedMailCopyManifest([
  { mail: ORDER_PLACED, path: "subject", locale: "fr", text: "Commande {ref} bien reçue" },
]);

function boot(manifest: MailCopyManifest): Promise<E2eContext> {
  return bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MailCopyManifest, value: manifest },
    ],
  });
}

async function subjectFr(ctx: E2eContext): Promise<{
  readonly view: MailCopyAdminView;
  readonly fr: MailCopyLocaleView | undefined;
}> {
  const view = jsonBody<MailCopyAdminView>(await ctx.asSub(E2E_STAFF_SUB).get(ADMIN).expect(200));
  const fr = view.mails
    .find((mail) => mail.mail === ORDER_PLACED)
    ?.texts.find((text) => text.path === "subject")?.locales.fr;
  return { view, fr };
}

describe("le texte d'origine a changé depuis la modification", () => {
  let before: E2eContext | null = null;
  let after: E2eContext | null = null;

  beforeAll(async () => {
    before = await boot(COMPILED);
    await before.reset();
  });
  afterAll(async () => {
    await before?.close();
    await after?.close();
  });

  it("se signale au déploiement d'après, sans bloquer « Publier », et « Rétablir » le retire", async () => {
    const first = before;
    if (first === null) {
      throw new Error("Le premier démarrage n'a pas eu lieu.");
    }
    const staff = (): ReturnType<E2eContext["asSub"]> => first.asSub(E2E_STAFF_SUB);
    await staff()
      .put(`${ADMIN}/drafts`)
      .send({
        mail: ORDER_PLACED,
        path: "subject",
        locale: "fr",
        text: "Merci {ref}",
        expectedRevision: 0,
      })
      .expect(204);
    await staff().post(`${ADMIN}/publications`).send({}).expect(201);
    const quiet = await subjectFr(first);
    expect(quiet.fr?.defaultChangedSince).toBeNull();
    expect(quiet.view.defaultChangedCount).toBe(0);
    await first.close();
    before = null;

    after = await boot(REWRITTEN);
    const flagged = await subjectFr(after);
    expect(flagged.fr).toMatchObject({
      default: "Commande {ref} bien reçue",
      publishedText: "Merci {ref}",
      defaultChangedSince: { previousDefault: PREVIOUS },
    });
    expect(flagged.view.defaultChangedCount).toBe(1);

    await after
      .asSub(E2E_STAFF_SUB)
      .post(`${ADMIN}/resets`)
      .send({ mail: ORDER_PLACED, path: "subject", locale: "fr", expectedRevision: 1 })
      .expect(204);
    const cleared = await subjectFr(after);
    expect(cleared.fr?.defaultChangedSince).toBeNull();
    expect(cleared.view.defaultChangedCount).toBe(0);
  });
});
