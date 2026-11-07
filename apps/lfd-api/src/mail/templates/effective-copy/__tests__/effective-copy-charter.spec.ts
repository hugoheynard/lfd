import type { MailCharterSettings } from "@lfd/mail-blocks";
import type { Mailer, MailReceipt, SendMailArgs } from "@lfd/mailer";

import type { MailCopyOverlay } from "../../copy/mail-copy-overlay.js";
import { b2bMailTemplates, type B2bMails } from "../../mail-templates.js";
import type { MailSectionOrders } from "../../sections/mail-layout-scope.js";
import { specimenDataOf } from "../../specimens/mail-specimens.js";
import { EffectiveCopyMailer, type EffectiveCopyLog } from "../effective-copy-mailer.js";
import type { PublishedMailCharters } from "../published-mail-charters.js";
import { PublishedMailCopyReader } from "../published-mail-copy.reader.js";
import type { PublishedMailDocuments } from "../published-mail-documents.js";

/** Les chartes publiées, servies telles quelles ; rien d'autre n'est publié. */
class PublishedCharters extends PublishedMailCopyReader {
  constructor(private readonly published: PublishedMailCharters | Error) {
    super();
  }
  read(): Promise<MailCopyOverlay> {
    return Promise.resolve({});
  }
  sectionOrders(): Promise<MailSectionOrders> {
    return Promise.resolve({});
  }
  documents(): Promise<PublishedMailDocuments> {
    return Promise.resolve({});
  }
  charters(): Promise<PublishedMailCharters> {
    return this.published instanceof Error
      ? Promise.reject(this.published)
      : Promise.resolve(this.published);
  }
}

const BRANDING = { supportEmail: "admin@lfc.test", backOfficeUrl: "https://bo.lfc.test" };

/** Un transport qui REND l'e-mail par le vrai registre, au moment de l'envoi. */
class RenderingTransport implements Mailer<B2bMails> {
  readonly enabled = false;
  readonly html: string[] = [];
  readonly attachments: number[] = [];
  private readonly registry = b2bMailTemplates(BRANDING);

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    const render: (data: B2bMails[K]) => {
      readonly html: string;
      readonly attachments?: readonly unknown[];
    } = this.registry[args.template];
    const mail = render(args.data);
    this.html.push(mail.html);
    this.attachments.push(mail.attachments?.length ?? 0);
    return Promise.resolve({ providerId: null });
  }
}

class RecordingLog implements EffectiveCopyLog {
  readonly warnings: string[] = [];
  warn(message: string): void {
    this.warnings.push(message);
  }
}

const LFD_CHARTER: MailCharterSettings = {
  logo: { src: "https://mail.lfd.test/images/logo-lfd.png", alt: { fr: "La Folie Douce" } },
  colors: {
    page: "#f4f1ea",
    card: "#fffefc",
    text: "#1b1b1b",
    mutedText: "#5a5a5a",
    primary: "#7a1f3d",
    border: "#ded6c8",
  },
  darkColors: { page: "#101010", card: "#1c1c1c", text: "#f0f0f0", border: "#333333" },
  headingFont: null,
  footer: { fr: "La Folie Douce — équipe" },
};

function argsOf<K extends keyof B2bMails>(template: K): SendMailArgs<B2bMails, K> {
  return { to: "equipe@exemple.invalid", template, data: specimenDataOf(template, "fr") };
}

async function sent<K extends keyof B2bMails>(
  template: K,
  charters: PublishedMailCharters | Error,
  log: RecordingLog = new RecordingLog(),
): Promise<{ readonly html: string; readonly attachments: number }> {
  const transport = new RenderingTransport();
  await new EffectiveCopyMailer(transport, new PublishedCharters(charters), log).send(
    argsOf(template),
  );
  return { html: transport.html[0] ?? "", attachments: transport.attachments[0] ?? -1 };
}

function codeRendering<K extends keyof B2bMails>(template: K): string {
  return b2bMailTemplates(BRANDING)[template](specimenDataOf(template, "fr")).html;
}

describe("la charte de l'espace à l'envoi (plan de l'éditeur par blocs, § 25, C1)", () => {
  it("sans charte publiée, un e-mail interne rend les octets d'avant, sans marque", async () => {
    const { html } = await sent("staff.account-alert", {});
    expect(html).toBe(codeRendering("staff.account-alert"));
    expect(html).not.toContain("La Folie Douce — équipe");
  });

  it("la charte La Folie Douce publiée donne aux e-mails internes ses couleurs, son logo et son pied", async () => {
    const { html, attachments } = await sent("staff.account-alert", {
      lfd: { kind: "servable", settings: LFD_CHARTER, version: 1 },
    });
    expect(html).toContain("background:#f4f1ea;");
    expect(html).toContain('src="https://mail.lfd.test/images/logo-lfd.png" alt="La Folie Douce"');
    expect(html).not.toContain("cid:lfc-logo");
    expect(html).toContain("La Folie Douce — équipe");
    expect(attachments).toBe(0);
  });

  it("la charte La Folie Douce ne touche pas un e-mail client", async () => {
    const { html } = await sent("customer.password-reset", {
      lfd: { kind: "servable", settings: LFD_CHARTER, version: 1 },
    });
    expect(html).toBe(codeRendering("customer.password-reset"));
  });

  it("une charte illisible fait partir l'e-mail avec la charte de départ, et le dit", async () => {
    const log = new RecordingLog();
    const { html } = await sent("staff.invited", { lfd: { kind: "unreadable", version: 3 } }, log);
    expect(html).toBe(codeRendering("staff.invited"));
    expect(log.warnings).toEqual([
      "Charte publiée v3 de l'espace « lfd » illisible par ce code : « staff.invited » part avec la charte de départ.",
    ]);
  });

  it("une lecture des chartes en échec fait partir l'e-mail, avec la charte de départ", async () => {
    const log = new RecordingLog();
    const { html } = await sent("staff.invited", new Error("base injoignable"), log);
    expect(html).toBe(codeRendering("staff.invited"));
    expect(log.warnings[0]).toContain("part avec la charte de départ");
  });
});
