/**
 * La scène des e2e des **textes des e-mails** (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, lot E2) :
 * l'application entière, le transport doublé SOUS le texte effectif, et les
 * gestes que les deux suites partagent.
 */
import type { MailCopyPreviewView } from "@lfd/contracts";
import type { Mailer, MailReceipt, SendMailArgs } from "@lfd/mailer";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { b2bMailTemplates, type B2bMails } from "../src/platform/mailer/mail-templates.js";
import { MAIL_TRANSPORT, MAILER, type B2bMailer } from "../src/platform/mailer/mailer.tokens.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Le jeton porteur EST le `sub` — le mur se joue en base, comme en production. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});

export const ADMIN = "/admin/mail-copy";
export const ORDER_PLACED = "customer.order-placed";

/** Un courriel tel que le transport l'a rendu. */
export interface Sent {
  readonly to: string;
  readonly template: string;
  readonly subject: string;
  readonly html: string;
}

/**
 * Le transport, doublé SOUS le texte effectif : il rend le vrai gabarit au
 * moment de l'envoi, comme `@lfd/mailer` — c'est là que le texte publié doit
 * déjà être appliqué.
 */
export class RenderingTransport implements Mailer<B2bMails> {
  readonly enabled = true;
  readonly sent: Sent[] = [];

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    const render = REGISTRY[args.template];
    const { subject, html } = render(args.data);
    this.sent.push({ to: args.to, template: String(args.template), subject, html });
    return Promise.resolve({ providerId: null });
  }
}

/** Ce que les suites manipulent. */
export interface MailCopyScene {
  readonly transport: RenderingTransport;
  readonly ctx: () => E2eContext;
  readonly staff: () => ReturnType<E2eContext["asSub"]>;
  readonly draft: (path: string, text: string, expectedRevision?: number) => Promise<void>;
  readonly preview: (source: "draft" | "published") => Promise<MailCopyPreviewView>;
  /** Un vrai envoi, par le mailer de l'application — texte effectif et journal compris. */
  readonly sendPasswordReset: () => Promise<Sent | undefined>;
}

/** Monte l'application pour la suite, et la remet à zéro avant chaque test. */
export function mailCopyScene(): MailCopyScene {
  const transport = new RenderingTransport();
  let current: E2eContext | null = null;
  const ctx = (): E2eContext => {
    if (current === null) {
      throw new Error("La scène des textes des e-mails n'est pas montée.");
    }
    return current;
  };

  beforeAll(async () => {
    current = await bootstrapE2e({
      overrides: [
        { token: AdminTokenVerifier, value: stubAdminVerifier },
        { token: MAIL_TRANSPORT, value: transport },
      ],
    });
  });
  afterAll(async () => {
    await ctx().close();
  });
  beforeEach(async () => {
    await ctx().reset();
    transport.sent.length = 0;
  });

  const staff = (): ReturnType<E2eContext["asSub"]> => ctx().asSub(E2E_STAFF_SUB);
  return {
    transport,
    ctx,
    staff,
    draft: async (path, text, expectedRevision = 0) => {
      await staff()
        .put(`${ADMIN}/drafts`)
        .send({ mail: ORDER_PLACED, path, locale: "fr", text, expectedRevision })
        .expect(204);
    },
    preview: async (source) =>
      jsonBody<MailCopyPreviewView>(
        await staff()
          .get(`${ADMIN}/previews?mail=${ORDER_PLACED}&locale=fr&source=${source}`)
          .expect(200),
      ),
    sendPasswordReset: async () => {
      await ctx()
        .app.get<B2bMailer>(MAILER)
        .send({
          to: "client@exemple.invalid",
          template: "customer.password-reset",
          data: { passwordSetupUrl: "https://exemple.invalid/ticket" },
        });
      return transport.sent.at(-1);
    },
  };
}
