import type { MailCopyOverlay } from "../../../../../platform/mailer/copy/mail-copy-overlay.js";
import { PublishedMailCopyReader } from "../../../../../platform/mailer/effective-copy/published-mail-copy.reader.js";
import type { MailSectionOrders } from "../../../../../platform/mailer/sections/mail-layout-scope.js";
import {
  ShortfallCustomerAlreadyNotifiedError,
  ShortfallLetterWithoutDecisionError,
} from "../../../domain/errors/shortfall-letter-errors.js";
import {
  ShortfallLetterReader,
  type ShortfallLetterSubject,
} from "../../../domain/ports/shortfall-letter.reader.js";
import { GetShortfallLetterDraftHandler } from "../get-shortfall-letter-draft.handler.js";
import { GetShortfallLetterDraftQuery } from "../get-shortfall-letter-draft.query.js";

const SUBJECT: ShortfallLetterSubject = {
  reference: "ORD-0001",
  locale: null,
  notified: false,
  lines: [
    { sku: "CRO", due: 3, packed: 1 },
    { sku: "PAC", due: 2, packed: 2 },
  ],
  names: new Map([
    ["CRO", "Croissant"],
    ["PAC", "Pain au chocolat"],
  ]),
  units: new Map([
    ["CRO", "piece"],
    ["PAC", "piece"],
  ]),
};

class FixedLetters extends ShortfallLetterReader {
  constructor(private readonly subject: ShortfallLetterSubject | null) {
    super();
  }

  subjectOf(): Promise<ShortfallLetterSubject | null> {
    return Promise.resolve(this.subject);
  }
}

class Published extends PublishedMailCopyReader {
  constructor(private readonly overlay: MailCopyOverlay | Error) {
    super();
  }

  read(): Promise<MailCopyOverlay> {
    return this.overlay instanceof Error
      ? Promise.reject(this.overlay)
      : Promise.resolve(this.overlay);
  }

  sectionOrders(): Promise<MailSectionOrders> {
    return Promise.resolve({});
  }
}

const draft = (
  subject: ShortfallLetterSubject | null,
  published: PublishedMailCopyReader | null = null,
): Promise<{ message: string }> =>
  new GetShortfallLetterDraftHandler(new FixedLetters(subject), published).execute(
    new GetShortfallLetterDraftQuery("ord_1"),
  );

describe("la proposition « Écrire au client » (E6d)", () => {
  it("dit ce qui part, ce qui manque, et la suite — en français pour une commande sans langue", async () => {
    const { message } = await draft(SUBJECT);

    expect(message).toContain("ORD-0001");
    expect(message).toContain("Ce qui part :\n– 1 × Croissant\n– 2 × Pain au chocolat");
    expect(message).toContain("Ce qui manque :\n– 2 × Croissant");
    expect(message).toContain("Contactez le service commercial.");
  });

  /** P6 de `pricing/plan-vente-au-poids.md` : un manquant au poids se dit en grammes, pas en pièces. */
  it("dit un manquant partiel au poids en grammes, et le lot parti en kilos", async () => {
    const { message } = await draft({
      ...SUBJECT,
      lines: [
        { sku: "SAU", due: 1250, packed: 1000 },
        { sku: "CRO", due: 3, packed: 3 },
      ],
      names: new Map([
        ["SAU", "Saumon gravlax"],
        ["CRO", "Croissant"],
      ]),
      units: new Map([
        ["SAU", "weight"],
        ["CRO", "piece"],
      ]),
    });

    expect(message).toContain("Ce qui part :\n– 1 kg × Saumon gravlax\n– 3 × Croissant");
    expect(message).toContain("Ce qui manque :\n– 250 g × Saumon gravlax");
    expect(message).not.toContain("250 × Saumon");
  });

  it("un article au poids entièrement absent manque de tout son poids", async () => {
    const { message } = await draft({
      ...SUBJECT,
      lines: [{ sku: "SAU", due: 500, packed: 0 }],
      names: new Map([["SAU", "Saumon gravlax"]]),
      units: new Map([["SAU", "weight"]]),
    });

    expect(message).toContain("Ce qui manque :\n– 500 g × Saumon gravlax");
  });

  it("parle la langue de la commande", async () => {
    expect((await draft({ ...SUBJECT, locale: "en" })).message).toContain("What leaves:");
  });

  it("suit les textes publiés, et le texte du code quand leur lecture échoue", async () => {
    const published = new Published({
      fr: { "customer.order-shortfall": { closing: "Pardon, vraiment." } },
    });
    expect((await draft(SUBJECT, published)).message).toContain("Pardon, vraiment.");
    expect((await draft(SUBJECT, new Published(new RangeError("base")))).message).toContain(
      "Toutes nos excuses",
    );
  });

  it("refuse une commande sans décision, et un client déjà prévenu", async () => {
    await expect(draft(null)).rejects.toBeInstanceOf(ShortfallLetterWithoutDecisionError);
    await expect(draft({ ...SUBJECT, notified: true })).rejects.toBeInstanceOf(
      ShortfallCustomerAlreadyNotifiedError,
    );
  });
});
