/**
 * La sonde de déploiement du courrier, contre le vrai Postgres (plan
 * `documentation/editeur-de-contenu/plan-service-e-mails.md`, lot S2h, § 18).
 *
 * Elle a quitté `platform/mailer/` pour le bloc `mail` : sa route ne change
 * pas (le workflow l'appelle par son chemin), elle part par `sendAndAwaitReceipt`, et le
 * suivi du bloc l'inscrit. Ce qu'un test unitaire ne peut pas dire : que la
 * route est encore servie au même chemin, derrière le même jeton, et que
 * l'envoi traverse le bloc jusqu'au transport. Seul le transport est doublé.
 */
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import type { B2bMails } from "../src/mail/templates/mail-templates.js";
import { MAILER, type B2bMailer } from "../src/mail/templates/mailer.tokens.js";

import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** Le transport doublé : il retient ce qu'il accepte, ou refuse tout. */
class ScriptedMailer implements B2bMailer {
  readonly enabled = true;
  readonly accepted: { readonly template: string; readonly to: string }[] = [];
  refuse = false;

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    if (this.refuse) {
      return Promise.reject(new Error("Resend a refusé l'envoi"));
    }
    this.accepted.push({ template: String(args.template), to: args.to });
    return Promise.resolve({ providerId: `re_${this.accepted.length}` });
  }
}

interface MailCheckBody {
  readonly sent: boolean;
  readonly immediate: string;
  readonly deferred: string;
  readonly revision: string;
}

const mailer = new ScriptedMailer();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: MAILER, value: mailer }] });
});

beforeEach(async () => {
  await ctx.reset();
  mailer.accepted.length = 0;
  mailer.refuse = false;
});

afterAll(async () => {
  await ctx.close();
});

function check() {
  return ctx
    .http()
    .post("/admin/ops/mail-check")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN);
}

describe("POST /admin/ops/mail-check — la sonde, par le bloc mail", () => {
  // Depuis S8 (plan § 25), chaque appel envoie DEUX e-mails : l'immédiat, et
  // un différé par la boîte d'envoi, attendu jusqu'à « envoyée ».
  it("part sur-le-champ ET en différé, est suivie au bloc, et deux appels font quatre e-mails", async () => {
    const first = jsonBody<MailCheckBody>(await check().expect(200));
    await check().expect(200);

    expect(first).toMatchObject({ sent: true, immediate: "sent", deferred: "sent" });
    expect(mailer.accepted.map((mail) => mail.template)).toEqual([
      "ops.deploy-check",
      "ops.deploy-check",
      "ops.deploy-check",
      "ops.deploy-check",
    ]);
    const rows = await ctx.prisma.mailRequest.findMany({ orderBy: { requestedAt: "asc" } });
    expect(rows.map((row) => row.status)).toEqual(["sent", "sent", "sent", "sent"]);
    expect(rows.filter((row) => row.idempotencyKey.endsWith(":deferred"))).toHaveLength(2);
    expect(
      rows.every((row) => row.idempotencyKey.startsWith(`ops.deploy-check:${first.revision}:`)),
    ).toBe(true);
  });

  it("un refus du fournisseur fait ÉCHOUER la route — le déploiement avec", async () => {
    mailer.refuse = true;

    const response = await check();

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mailer.accepted).toEqual([]);
  });

  it("sans le jeton machine, la route est refusée et rien ne part", async () => {
    await ctx.http().post("/admin/ops/mail-check").expect(401);
    expect(mailer.accepted).toEqual([]);
  });
});
