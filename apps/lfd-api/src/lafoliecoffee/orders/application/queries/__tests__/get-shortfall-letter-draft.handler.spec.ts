import {
  ShortfallLetterDrafter,
  type OrderShortfallDraftData,
} from "../../../../../mail/channels/templates/shortfall-letter-drafter.js";
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

/**
 * La rédaction est au bloc `mail` depuis le lot S3b (ses textes sont éprouvés
 * par `mail/templates/__tests__/published-shortfall-letter-drafter.spec.ts`) :
 * ici, ce que la commande lui demande.
 */
class RecordingDrafter extends ShortfallLetterDrafter {
  readonly asked: OrderShortfallDraftData[] = [];

  draft(data: OrderShortfallDraftData): Promise<string> {
    this.asked.push(data);
    return Promise.resolve(`proposition ${data.reference}`);
  }
}

const draft = async (
  subject: ShortfallLetterSubject | null,
): Promise<{ readonly message: string; readonly asked: OrderShortfallDraftData | undefined }> => {
  const drafter = new RecordingDrafter();
  const { message } = await new GetShortfallLetterDraftHandler(
    new FixedLetters(subject),
    drafter,
  ).execute(new GetShortfallLetterDraftQuery("ord_1"));
  return { message, asked: drafter.asked[0] };
};

describe("la proposition « Écrire au client » (E6d)", () => {
  it("demande ce qui part et ce qui manque — en français pour une commande sans langue", async () => {
    const { message, asked } = await draft(SUBJECT);

    expect(message).toBe("proposition ORD-0001");
    expect(asked).toEqual({
      reference: "ORD-0001",
      departed: [
        { product: "Croissant", quantity: 1 },
        { product: "Pain au chocolat", quantity: 2 },
      ],
      missing: [{ product: "Croissant", quantity: 2 }],
      locale: "fr",
    });
  });

  /** P6 de `pricing/vente-au-poids.md` : un manquant au poids se dit en grammes, pas en pièces. */
  it("passe un manquant partiel au poids en grammes, et le lot parti, marqués au poids", async () => {
    const { asked } = await draft({
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

    expect(asked?.departed).toEqual([
      { product: "Saumon gravlax", quantity: 1000, saleUnit: "weight" },
      { product: "Croissant", quantity: 3 },
    ]);
    expect(asked?.missing).toEqual([
      { product: "Saumon gravlax", quantity: 250, saleUnit: "weight" },
    ]);
  });

  it("un article au poids entièrement absent manque de tout son poids", async () => {
    const { asked } = await draft({
      ...SUBJECT,
      lines: [{ sku: "SAU", due: 500, packed: 0 }],
      names: new Map([["SAU", "Saumon gravlax"]]),
      units: new Map([["SAU", "weight"]]),
    });

    expect(asked?.departed).toEqual([]);
    expect(asked?.missing).toEqual([
      { product: "Saumon gravlax", quantity: 500, saleUnit: "weight" },
    ]);
  });

  it("demande la langue de la commande", async () => {
    expect((await draft({ ...SUBJECT, locale: "en" })).asked?.locale).toBe("en");
  });

  it("refuse une commande sans décision, et un client déjà prévenu", async () => {
    await expect(draft(null)).rejects.toBeInstanceOf(ShortfallLetterWithoutDecisionError);
    await expect(draft({ ...SUBJECT, notified: true })).rejects.toBeInstanceOf(
      ShortfallCustomerAlreadyNotifiedError,
    );
  });
});
