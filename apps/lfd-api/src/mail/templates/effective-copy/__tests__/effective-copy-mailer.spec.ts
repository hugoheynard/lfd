import type { Mailer, MailReceipt, SendMailArgs } from "@lfd/mailer";

import { mailCopyOf } from "../../copy/mail-copy.js";
import { withMailCopyOverlay, type MailCopyOverlay } from "../../copy/mail-copy-overlay.js";
import { b2bMailTemplates, type B2bMails } from "../../mail-templates.js";
import type { MailSectionOrders } from "../../sections/mail-layout-scope.js";
import { EffectiveCopyMailer, type EffectiveCopyLog } from "../effective-copy-mailer.js";
import { PublishedMailCopyReader } from "../published-mail-copy.reader.js";

/** Un transport qui relève l'objet de confirmation tel qu'il le lirait au rendu. */
class SubjectReadingTransport implements Mailer<B2bMails> {
  readonly enabled = false;
  readonly subjects: string[] = [];

  send<K extends keyof B2bMails>(_args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.subjects.push(mailCopyOf("fr")["customer.order-placed"].subject);
    return Promise.resolve({ providerId: null });
  }
}

class StaticPublished extends PublishedMailCopyReader {
  reads = 0;
  constructor(
    private readonly overlay: MailCopyOverlay | Error,
    private readonly orders: MailSectionOrders | Error = {},
  ) {
    super();
  }
  read(): Promise<MailCopyOverlay> {
    this.reads += 1;
    return this.overlay instanceof Error
      ? Promise.reject(this.overlay)
      : Promise.resolve(this.overlay);
  }
  sectionOrders(): Promise<MailSectionOrders> {
    return this.orders instanceof Error
      ? Promise.reject(this.orders)
      : Promise.resolve(this.orders);
  }
}

/** Un transport qui REND l'e-mail par le vrai registre, au moment de l'envoi. */
class RenderingTransport implements Mailer<B2bMails> {
  readonly enabled = false;
  readonly html: string[] = [];
  private readonly registry = b2bMailTemplates({
    supportEmail: "admin@lfc.test",
    backOfficeUrl: "https://bo.lfc.test",
  });

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    const render: (data: B2bMails[K]) => { readonly html: string } = this.registry[args.template];
    this.html.push(render(args.data).html);
    return Promise.resolve({ providerId: null });
  }
}

/** Le pied d'abord, le titre ensuite : l'ordre publié se lit à leur place dans le HTML. */
const FOOTER_FIRST: MailSectionOrders = {
  "customer.password-reset": ["footer", "title", "body", "cta"],
};

class RecordingLog implements EffectiveCopyLog {
  readonly warnings: string[] = [];
  warn(message: string): void {
    this.warnings.push(message);
  }
}

const ARGS: SendMailArgs<B2bMails, "customer.password-reset"> = {
  to: "client@exemple.invalid",
  template: "customer.password-reset",
  data: { passwordSetupUrl: "https://exemple.invalid" },
};
const PUBLISHED = { fr: { "customer.order-placed": { subject: "Publié {ref}" } } };
const DEFAULT = "Votre commande {ref} — La Folie Coffee";

describe("le mailer du texte effectif (C2)", () => {
  it("rend avec le texte publié", async () => {
    const transport = new SubjectReadingTransport();
    await new EffectiveCopyMailer(
      transport,
      new StaticPublished(PUBLISHED),
      new RecordingLog(),
    ).send(ARGS);
    expect(transport.subjects).toEqual(["Publié {ref}"]);
  });

  /** Un e-mail part même si la base ne répond pas sur ce point : le texte du code, et un mot au journal. */
  it("se replie sur le texte du code quand le publié est illisible, et le dit", async () => {
    const transport = new SubjectReadingTransport();
    const log = new RecordingLog();
    const receipt = await new EffectiveCopyMailer(
      transport,
      new StaticPublished(new Error("base injoignable")),
      log,
    ).send(ARGS);

    expect(receipt).toEqual({ providerId: null });
    expect(transport.subjects).toEqual([DEFAULT]);
    expect(log.warnings).toHaveLength(1);
    expect(log.warnings[0]).toContain("« customer.password-reset » part avec le texte du code");
  });

  it("sans port relié, le texte du code", async () => {
    const transport = new SubjectReadingTransport();
    await new EffectiveCopyMailer(transport, null, new RecordingLog()).send(ARGS);
    expect(transport.subjects).toEqual([DEFAULT]);
  });

  it("un périmètre déjà ouvert — l'essai d'un brouillon — l'emporte sur le publié", async () => {
    const transport = new SubjectReadingTransport();
    const published = new StaticPublished(PUBLISHED);
    const mailer = new EffectiveCopyMailer(transport, published, new RecordingLog());
    await withMailCopyOverlay(
      { fr: { "customer.order-placed": { subject: "Brouillon {ref}" } } },
      () => mailer.send(ARGS),
    );
    expect(transport.subjects).toEqual(["Brouillon {ref}"]);
    expect(published.reads).toBe(0);
  });

  it("rend dans l'ordre des sections publié (E4, S3)", async () => {
    const transport = new RenderingTransport();
    await new EffectiveCopyMailer(
      transport,
      new StaticPublished({}, FOOTER_FIRST),
      new RecordingLog(),
    ).send(ARGS);
    const html = transport.html[0] ?? "";
    expect(html.indexOf('<p style="margin:24px 0 0;line-height:1.5;font-size:13px')).toBeLessThan(
      html.indexOf("<h1"),
    );
    expect(html).not.toContain("data-mail-section");
  });

  /** L'ordre illisible n'empêche ni l'envoi ni les textes publiés : l'ordre du code, et un mot. */
  it("se replie sur l'ordre du code quand l'ordre publié est illisible, et le dit", async () => {
    const transport = new RenderingTransport();
    const log = new RecordingLog();
    await new EffectiveCopyMailer(
      transport,
      new StaticPublished({}, new Error("base injoignable")),
      log,
    ).send(ARGS);
    const html = transport.html[0] ?? "";
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("font-size:13px;color"));
    expect(log.warnings).toEqual([
      expect.stringContaining("« customer.password-reset » part dans l'ordre du code"),
    ]);
  });
});
