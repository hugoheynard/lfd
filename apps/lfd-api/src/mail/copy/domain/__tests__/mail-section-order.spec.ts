import { MailCopyEntry } from "../mail-copy-entry.js";
import {
  InvalidMailSectionOrderError,
  MailSectionOrderChangedError,
  NothingToPublishError,
  UnknownMailError,
} from "../mail-copy-errors.js";
import { MailCopyRelease } from "../mail-copy-release.js";
import { MailSectionOrder } from "../mail-section-order.js";
import { replacementSectionOrders } from "../mail-section-orders.js";
import { DEFAULT_ORDER, MANIFEST, QR_FIRST, SUBJECT, stamp } from "./mail-copy-fixtures.js";

const AT = new Date(0);
const MAIL = "customer.order-placed";

function drafted(order: readonly string[]): MailSectionOrder {
  const entry = MailSectionOrder.untouched(MAIL);
  entry.draft(order, MANIFEST, 0, stamp(AT));
  return entry;
}

describe("l'ordre des sections d'un e-mail (E4, S2)", () => {
  it("pose un ordre qui range chaque section une fois, et monte la révision", () => {
    const entry = drafted(QR_FIRST);
    expect(entry.snapshot()).toMatchObject({
      revision: 1,
      draft: { state: "set", order: [...QR_FIRST] },
      drafted: stamp(AT),
      publishedOrder: null,
    });
  });

  it.each([
    [["title", "body", "image"], "il manque footer"],
    [["title", "title", "body", "image", "footer"], "title apparaît deux fois"],
    [
      ["title", "body", "image", "footer", "itinerary"],
      "itinerary n'est pas une section de cet e-mail",
    ],
  ])("refuse %j en le disant : « %s »", (order, reason) => {
    expect(() => drafted(order)).toThrow(InvalidMailSectionOrderError);
    expect(() => drafted(order)).toThrow(reason);
    expect(() => drafted(order)).toThrow(
      "Sections attendues, chacune une fois : title, body, image, footer.",
    );
  });

  it("refuse de déplacer l'en-tête ou le recours : ce sont des cadres", () => {
    expect(() => drafted(["header", ...DEFAULT_ORDER])).toThrow(
      "l'en-tête et le recours restent à leur place",
    );
    expect(() => drafted([...DEFAULT_ORDER, "support"])).toThrow(InvalidMailSectionOrderError);
  });

  it("refuse un e-mail sans sections déclarées, et une révision dépassée", () => {
    expect(() =>
      MailSectionOrder.untouched("customer.company-attached").draft(
        DEFAULT_ORDER,
        MANIFEST,
        0,
        stamp(AT),
      ),
    ).toThrow(UnknownMailError);
    expect(() => drafted(QR_FIRST).draft(DEFAULT_ORDER, MANIFEST, 0, stamp(AT))).toThrow(
      MailSectionOrderChangedError,
    );
  });

  it("se publie, puis se rétablit : `reset` rend l'ordre du code au « Publier » suivant", () => {
    const entry = drafted(QR_FIRST);
    expect(entry.publish(MANIFEST, stamp(AT))).toEqual({
      mail: MAIL,
      before: null,
      after: [...QR_FIRST],
    });
    entry.reset(1, stamp(AT));
    expect(entry.snapshot().draft).toEqual({ state: "reset" });
    expect(entry.publish(MANIFEST, stamp(AT))).toEqual({
      mail: MAIL,
      before: [...QR_FIRST],
      after: null,
    });
    expect(entry.snapshot().publishedOrder).toBeNull();
  });

  it("rétablir sans rien de publié abandonne simplement le brouillon", () => {
    const entry = drafted(QR_FIRST);
    entry.reset(1, stamp(AT));
    expect(entry.snapshot().draft).toEqual({ state: "unchanged" });
  });
});

describe("la publication commune des textes et des ordres (E4, S3)", () => {
  it("publie un ordre seul, monte la version, et rend son changement", () => {
    const release = MailCopyRelease.of(2, [], [drafted(QR_FIRST)]);
    expect(release.publish(MANIFEST, stamp(AT))).toEqual({
      texts: [],
      sectionOrders: [{ mail: MAIL, before: null, after: [...QR_FIRST] }],
    });
    expect(release.version).toBe(3);
  });

  it("publie textes et ordres ensemble, d'un seul geste", () => {
    const subject = MailCopyEntry.untouched(SUBJECT.mail, SUBJECT.path, "fr");
    subject.draft("Merci {ref}", MANIFEST, 0, stamp(AT));
    const publication = MailCopyRelease.of(0, [subject], [drafted(QR_FIRST)]).publish(
      MANIFEST,
      stamp(AT),
    );
    expect(publication.texts).toHaveLength(1);
    expect(publication.sectionOrders).toHaveLength(1);
  });

  /** Une section retirée du code depuis le brouillon : il n'est pas publiable, il reste. */
  it("ne publie pas un ordre que les sections du code ne permettent plus", () => {
    const stale = MailSectionOrder.reconstitute({
      mail: MAIL,
      revision: 1,
      draft: { state: "set", order: ["image", "title", "body", "footer", "retiree"] },
      drafted: stamp(AT),
      publishedOrder: null,
      published: null,
    });
    expect(() => MailCopyRelease.of(0, [], [stale]).publish(MANIFEST, stamp(AT))).toThrow(
      NothingToPublishError,
    );
    expect(stale.snapshot().draft.state).toBe("set");
  });
});

describe("l'ordre effectif, par source", () => {
  it("brouillon : le `set`, rien pour un `reset` ; publié : le publié — s'il tient encore", () => {
    const states = [
      { ...drafted(QR_FIRST).snapshot(), publishedOrder: [...DEFAULT_ORDER].reverse() },
      { ...drafted(QR_FIRST).snapshot(), mail: "inconnu" },
    ];
    expect(replacementSectionOrders(states, MANIFEST, "draft")).toEqual({ [MAIL]: [...QR_FIRST] });
    expect(replacementSectionOrders(states, MANIFEST, "published")).toEqual({
      [MAIL]: [...DEFAULT_ORDER].reverse(),
    });
    const reset = [{ ...drafted(QR_FIRST).snapshot(), draft: { state: "reset" as const } }];
    expect(replacementSectionOrders(reset, MANIFEST, "draft")).toEqual({});
  });
});
