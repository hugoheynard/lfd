import { DryRunMailer } from "../dry-run-mailer.js";
import { renderLayout } from "../html.js";
import { ResendMailer, type ResendLike } from "../resend-mailer.js";
import type { MailerLogger, SendMailArgs, TemplateRegistry } from "../types.js";

/*
 * Régression : le contexte des journaux du mailer portait `to`, l'adresse du
 * destinataire — une donnée personnelle dans un journal gardé hors du registre
 * RGPD (constaté le 2026-11-07). Il porte désormais la clé d'idempotence.
 */

interface TestMails {
  "test.hello": { name: string };
}

const registry: TemplateRegistry<TestMails> = {
  "test.hello": (data) => ({
    subject: `Bonjour ${data.name}`,
    html: renderLayout({ title: "Bonjour", body: data.name }),
  }),
};

const ADDRESS = "camille.secret@exemple.fr";
const HELLO: SendMailArgs<TestMails, "test.hello"> = {
  to: ADDRESS,
  template: "test.hello",
  data: { name: "Camille" },
  idempotencyKey: "hello:1",
};

type Reply = Awaited<ReturnType<ResendLike["emails"]["send"]>>;

/** Journal qui garde tout ce qu'on lui écrit, sérialisé. */
function recordingLogger(): { logger: MailerLogger; lines: string[] } {
  const lines: string[] = [];
  const keep = (message: string, context?: Readonly<Record<string, unknown>>): void => {
    lines.push(JSON.stringify({ message, context }));
  };
  return { logger: { info: keep, warn: keep, error: keep }, lines };
}

function resendReplying(reply: Reply): ResendLike {
  return { emails: { send: () => Promise.resolve(reply) } };
}

function mailerWith(reply: Reply, logger: MailerLogger): ResendMailer<TestMails> {
  return new ResendMailer<TestMails>({
    client: resendReplying(reply),
    registry,
    fromAddress: "LFC <noreply@lfc.fr>",
    logger,
    sleep: () => Promise.resolve(),
  });
}

describe("les journaux du mailer ne portent jamais l'adresse du destinataire", () => {
  it("un envoi accepté : la clé et l'identifiant Resend, pas l'adresse", async () => {
    const { logger, lines } = recordingLogger();
    const accepted: Reply = { data: { id: "re_1" }, error: null, headers: {} };

    await mailerWith(accepted, logger).send(HELLO);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toContain(ADDRESS);
    expect(lines.join("\n")).toContain('"idempotencyKey":"hello:1"');
    expect(lines.join("\n")).toContain('"providerId":"re_1"');
  });

  it("un envoi refusé : le journal du refus ne porte pas l'adresse", async () => {
    const { logger, lines } = recordingLogger();
    const refused: Reply = {
      data: null,
      error: { message: "invalid", name: "validation_error", statusCode: 422 },
      headers: {},
    };

    await expect(mailerWith(refused, logger).send(HELLO)).rejects.toThrow();

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toContain(ADDRESS);
  });

  it("le mailer à blanc ne journalise pas l'adresse non plus", async () => {
    const { logger, lines } = recordingLogger();

    await new DryRunMailer<TestMails>(registry, logger).send(HELLO);

    expect(lines.join("\n")).not.toContain(ADDRESS);
    expect(lines.join("\n")).toContain('"idempotencyKey":"hello:1"');
  });
});
