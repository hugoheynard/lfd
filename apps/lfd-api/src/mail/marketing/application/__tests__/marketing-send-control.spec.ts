import type { MailNature } from "@lfd/mail-blocks";
import type { MailReceipt, RenderedMail, SendMailArgs } from "@lfd/mailer";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { MailAttachments } from "../../../requests/application/mail-attachments.js";
import { newMailRequest } from "../../../requests/application/mail-requester.service.js";
import { MailSendAttempt } from "../../../requests/application/mail-send-attempt.js";
import { InMemoryAttachmentStore } from "../../../requests/application/__tests__/mail-doubles.js";
import { MarketingMailRefusedError } from "../../../requests/domain/errors/mail-request.errors.js";
import { MailNatures } from "../../../requests/domain/ports/mail-natures.js";
import { MailerMailDispatch } from "../../../requests/infrastructure/mailer-mail-dispatch.js";
import { b2bMailTemplates, type B2bMails } from "../../../templates/mail-templates.js";
import type { B2bMailer } from "../../../templates/mailer.tokens.js";
import { natureOf } from "../../../templates/sections/mail-block-declarations.js";
import { mailSpaceOf } from "../../../templates/sections/mail-block-declarations.js";
import { mailKeys, specimenDataOf } from "../../../templates/specimens/mail-specimens.js";
import { MarketingPreference } from "../../domain/entities/marketing-preference.js";
import { MarketingAddresses } from "../services/marketing-addresses.js";
import { PreferenceMarketingClearance } from "../services/preference-marketing-clearance.js";
import { UnsubscribeLinks } from "../services/unsubscribe-links.js";
import {
  FixedOrigins,
  InMemoryPreferenceReader,
  InMemoryPreferences,
  PlainTokens,
  ReadablePrint,
} from "./marketing-doubles.js";

/**
 * **Tout modèle marketing a son pied, ses en-têtes et son contrôle** (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, U3 ; remplace le
 * test U1 « aucun modèle n'est marketing »).
 *
 * Éprouvé sur les modèles marketing du registre (aucun le 2026-11-08) ET sur
 * un modèle marketing d'ESSAI : un modèle du registre que ce test seul
 * déclare marketing — la production n'en porte aucun. La liste éprouvée
 * n'est donc jamais vide.
 *
 * Tout est réel sauf le transport (qui rend le modèle sans l'envoyer), le
 * registre en mémoire et l'empreinte lisible.
 */

const TRIAL: keyof B2bMails = "customer.company-attached";
const ORIGIN = "https://shop.lfc.test";
const ADDRESS = "Colette@Halles.fr";

/** Les natures du registre, et le modèle d'essai déclaré marketing. */
class TrialNatures extends MailNatures {
  natureOf(template: string): MailNature | null {
    return template === TRIAL ? "marketing" : natureOf(template);
  }
}

/** Le transport qui rend le modèle comme Resend le recevrait, et garde le rendu. */
class RenderingMailer implements B2bMailer {
  readonly enabled = true;
  readonly sent: { readonly rendered: RenderedMail; readonly args: SendMailArgs<B2bMails> }[] = [];
  private readonly registry = b2bMailTemplates({
    supportEmail: "admin@lfc.test",
    backOfficeUrl: "https://admin.lfc.test",
  });

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.sent.push({ rendered: this.registry[args.template](args.data), args });
    return Promise.resolve({ providerId: `re_${String(this.sent.length)}` });
  }
}

function scene() {
  const natures = new TrialNatures();
  const preferences = new InMemoryPreferences();
  const reader = new InMemoryPreferenceReader(preferences);
  const addresses = new MarketingAddresses(new ReadablePrint());
  const links = new UnsubscribeLinks(new FixedOrigins({ lfc: ORIGIN }), new PlainTokens());
  const mailer = new RenderingMailer();
  const clock = new FixedClock(new Date(0));
  const attempt = new MailSendAttempt(
    new MailerMailDispatch(mailer),
    new MailAttachments(new InMemoryAttachmentStore()),
    new PreferenceMarketingClearance(natures, addresses, reader, links),
    clock,
  );
  const seed = async (template: keyof B2bMails, status: "accepted" | "unsubscribed") => {
    const space = mailSpaceOf(template);
    const address = addresses.of(ADDRESS);
    const accepted = MarketingPreference.accepted("pref_1", space, address, {
      proof: { textVersion: "v1", locale: "fr", place: "signup", ref: null },
      origin: "direct",
      at: clock.now(),
    });
    if (status === "unsubscribed") {
      accepted.unsubscribe({ at: clock.now(), source: "link" });
    }
    await preferences.save(accepted);
  };
  const send = async (template: keyof B2bMails) => {
    const mail = {
      template,
      to: ADDRESS,
      data: specimenDataOf(template, "fr"),
      idempotencyKey: `k:${template}`,
    };
    const request = newMailRequest({ ...mail, brand: mailSpaceOf(template) }, "r1", clock.now());
    const outcome = await attempt.attempt(request, mail);
    return { outcome, request };
  };
  return { natures, reader, mailer, seed, send };
}

const MARKETING = [...mailKeys().filter((mail) => natureOf(mail) === "marketing"), TRIAL] as const;

describe("la liste éprouvée", () => {
  it("n'est jamais vide : le modèle d'essai y est, et lui seul n'est pas au registre", () => {
    expect(MARKETING).toContain(TRIAL);
    expect(natureOf(TRIAL)).toBe("transactional");
  });
});

describe.each(MARKETING)("le modèle marketing « %s »", (template) => {
  it("ne part pas sans accord : `no_consent`, rien chez le fournisseur", async () => {
    const { mailer, send } = scene();

    const { outcome, request } = await send(template);

    expect(outcome.kind).toBe("refused");
    expect(outcome.kind === "refused" && outcome.error).toBeInstanceOf(MarketingMailRefusedError);
    expect(request.snapshot()).toMatchObject({ status: "refused", refusalCode: "no_consent" });
    expect(mailer.sent).toEqual([]);
  });

  it("ne part pas à une adresse désinscrite : `unsubscribed`", async () => {
    const { mailer, seed, send } = scene();
    await seed(template, "unsubscribed");

    const { request } = await send(template);

    expect(request.snapshot()).toMatchObject({ status: "refused", refusalCode: "unsubscribed" });
    expect(mailer.sent).toEqual([]);
  });

  it("part à une adresse inscrite, avec son pied (HTML et texte) et ses en-têtes", async () => {
    const { mailer, seed, send } = scene();
    await seed(template, "accepted");

    const { outcome } = await send(template);

    expect(outcome.kind).toBe("sent");
    const [sent] = mailer.sent;
    const url = `${ORIGIN}/api/lfd/mail/unsubscribe/${mailSpaceOf(template)}:colette@halles.fr`;
    expect(sent?.args.headers).toEqual({
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(sent?.rendered.html).toContain(`href="${url}"`);
    expect(sent?.rendered.text).toContain(url);
  });
});

describe("règle 25 — un transactionnel ne lit jamais le registre", () => {
  it("part même vers une adresse désinscrite, sans une seule lecture du registre", async () => {
    const { reader, mailer, seed, send } = scene();
    const transactional: keyof B2bMails = "customer.password-reset";
    await seed(transactional, "unsubscribed");

    const { outcome } = await send(transactional);

    expect(outcome.kind).toBe("sent");
    expect(reader.reads).toBe(0);
    expect(mailer.sent[0]?.args.headers).toBeUndefined();
    expect(mailer.sent[0]?.rendered.html).not.toContain("data-mail-unsubscribe");
  });
});

describe("l'origine de l'espace manque", () => {
  it("un marketing autorisé ne part pas sans son lien : refus, rien chez le fournisseur", async () => {
    const preferences = new InMemoryPreferences();
    const addresses = new MarketingAddresses(new ReadablePrint());
    await preferences.save(
      MarketingPreference.accepted("p", "lfc", addresses.of(ADDRESS), {
        proof: { textVersion: "v1", locale: "fr", place: "signup", ref: null },
        origin: "direct",
        at: new Date(0),
      }),
    );
    const clearance = new PreferenceMarketingClearance(
      new TrialNatures(),
      addresses,
      new InMemoryPreferenceReader(preferences),
      new UnsubscribeLinks(new FixedOrigins({}), new PlainTokens()),
    );

    await expect(
      clearance.verdictFor({ template: TRIAL, space: "lfc", recipient: ADDRESS }),
    ).rejects.toThrow(/origine publique/u);
  });
});
