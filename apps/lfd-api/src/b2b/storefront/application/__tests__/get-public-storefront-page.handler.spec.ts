import type {
  PublicStorefrontContent,
  PublicStorefrontObjectView,
  PublicStorefrontPageView,
} from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { PublicStorefrontReader } from "../../domain/public-storefront.reader.js";
import {
  StorefrontOperationsReader,
  type ShownOperation,
  type StorefrontAudience,
} from "../../domain/storefront-operations.reader.js";
import { GetPublicStorefrontPageHandler } from "../get-public-storefront-page.handler.js";
import { GetPublicStorefrontPageQuery } from "../get-public-storefront-page.query.js";

/** Une page écrite à la main — ce que la vitrine a enregistré. */
class FixedPage extends PublicStorefrontReader {
  constructor(private readonly page: PublicStorefrontPageView) {
    super();
  }

  pageOf(): Promise<PublicStorefrontPageView> {
    return Promise.resolve(this.page);
  }
}

/** Les opérations montrées, par clientèle ; chaque question est retenue. */
class ShownByAudience extends StorefrontOperationsReader {
  readonly asked: StorefrontAudience[] = [];

  constructor(private readonly byAudience: Partial<Record<StorefrontAudience, ShownOperation[]>>) {
    super();
  }

  shownTo(audience: StorefrontAudience): Promise<ReadonlyMap<string, ShownOperation>> {
    this.asked.push(audience);
    const shown = this.byAudience[audience] ?? [];
    return Promise.resolve(new Map(shown.map((operation) => [operation.key, operation])));
  }
}

const NOW = new FixedClock(new Date(0));

/** Noël, montré ; ses dates ne sont comparées qu'entre elles — l'horloge est ailleurs. */
const NOEL: ShownOperation = {
  key: "noel-2026",
  name: { fr: "Noël", en: "Christmas" },
  lede: { fr: "Bûches et chocolats" },
  image: { url: "https://cdn.example/noel.jpg", alt: "Une bûche" },
  state: "announced",
  orderFrom: new Date("2026-11-15T08:00:00.000Z"),
  orderUntil: new Date("2026-12-21T11:00:00.000Z"),
  pickupFrom: "2026-12-20",
  pickupUntil: "2026-12-24",
};

const LINKED: PublicStorefrontContent = {
  kind: "info",
  badge: null,
  title: { fr: "" },
  lede: null,
  image: null,
  linkShelfKey: null,
  operationKey: "noel-2026",
  action: "operation",
};

const PLAIN: PublicStorefrontContent = {
  kind: "info",
  badge: null,
  title: { fr: "Fermé le 25" },
  lede: null,
  image: null,
  linkShelfKey: null,
  operationKey: null,
  action: "none",
};

function object(contents: PublicStorefrontContent[]): PublicStorefrontObjectView {
  return {
    id: "obj_1",
    shape: "block",
    column: 1,
    row: 1,
    applyOnMobile: true,
    mediaFit: "cover",
    mediaSide: "left",
    carousel: null,
    tone: "light",
    contents,
  };
}

async function read(
  contents: PublicStorefrontContent[],
  operations: ShownByAudience,
  companyId: string | null = null,
  shelfKey = "all",
): Promise<readonly PublicStorefrontContent[]> {
  const handler = new GetPublicStorefrontPageHandler(
    new FixedPage({ rows: 2, objects: [object(contents)] }),
    operations,
    NOW,
  );
  const page = await handler.execute(new GetPublicStorefrontPageQuery(shelfKey, companyId));
  return page.objects[0]?.contents ?? [];
}

describe("GetPublicStorefrontPageHandler — les annonces d'opération (D11)", () => {
  it("sert une annonce liée avec ce qu'elle hérite, et le bloc de son opération", async () => {
    const [content] = await read([LINKED], new ShownByAudience({ public: [NOEL] }));

    expect(content).toEqual({
      ...LINKED,
      title: { fr: "Noël", en: "Christmas" },
      lede: { fr: "Bûches et chocolats" },
      image: { url: "https://cdn.example/noel.jpg", alt: { fr: "Une bûche" } },
      operation: {
        key: "noel-2026",
        state: "announced",
        orderFrom: "2026-11-15T08:00:00.000Z",
        orderUntil: "2026-12-21T11:00:00.000Z",
        pickupFrom: "2026-12-20",
        pickupUntil: "2026-12-24",
      },
    });
  });

  it("un champ rempli surcharge l'héritage ; le badge reste à calculer", async () => {
    const [content] = await read(
      [{ ...LINKED, title: { fr: "Le rayon de Noël" }, lede: { fr: "Commandez tôt" } }],
      new ShownByAudience({ public: [NOEL] }),
    );

    expect(content).toMatchObject({
      badge: null,
      title: { fr: "Le rayon de Noël" },
      lede: { fr: "Commandez tôt" },
      image: { url: "https://cdn.example/noel.jpg" },
    });
  });

  it("omet l'annonce d'une opération que cette clientèle ne voit pas, et garde le reste", async () => {
    const contents = await read([LINKED, PLAIN], new ShownByAudience({ pro: [NOEL] }));

    expect(contents).toEqual([{ ...PLAIN, operation: null }]);
  });

  it("une société reconnue lit la clientèle pro", async () => {
    const operations = new ShownByAudience({ pro: [NOEL] });
    const contents = await read([LINKED], operations, "company_1");

    expect(operations.asked).toEqual(["pro"]);
    expect(contents).toHaveLength(1);
  });

  it("ne lit pas les opérations quand la page n'en annonce aucune", async () => {
    const operations = new ShownByAudience({ public: [NOEL] });
    const contents = await read([PLAIN, { kind: "product", sku: "CRO" }], operations);

    expect(operations.asked).toEqual([]);
    expect(contents).toEqual([
      { ...PLAIN, operation: null },
      { kind: "product", sku: "CRO" },
    ]);
  });

  it("un objet dont toutes les annonces sont éteintes reste, sans contenu", async () => {
    const contents = await read([LINKED], new ShownByAudience({}));

    expect(contents).toEqual([]);
  });

  it("une image d'opération sans texte alternatif n'en invente pas", async () => {
    const [content] = await read(
      [LINKED],
      new ShownByAudience({
        public: [{ ...NOEL, image: { url: "https://cdn.example/x.jpg", alt: "" } }],
      }),
    );

    expect(content).toMatchObject({ image: { url: "https://cdn.example/x.jpg", alt: null } });
  });

  /** Régression : la tuile Noël paraissait dans le rayon de Noël, qu'elle annonce (2026-09-25). */
  it("n'annonce pas une opération dans son propre rayon, et garde le reste", async () => {
    const contents = await read(
      [LINKED, PLAIN],
      new ShownByAudience({ public: [NOEL] }),
      null,
      "op:noel-2026",
    );

    expect(contents).toEqual([{ ...PLAIN, operation: null }]);
  });

  it("omet aussi l'annonce qui ouvre le rayon de l'opération qu'on sert", async () => {
    const opening: PublicStorefrontContent = {
      ...PLAIN,
      linkShelfKey: "op:noel-2026",
      action: "shelf",
    };
    const contents = await read([opening], new ShownByAudience({}), null, "op:noel-2026");

    expect(contents).toEqual([]);
  });

  it("montre l'annonce d'une AUTRE opération dans un rayon d'opération", async () => {
    const contents = await read(
      [LINKED],
      new ShownByAudience({ public: [NOEL] }),
      null,
      "op:paques-2027",
    );

    expect(contents).toHaveLength(1);
  });
});
