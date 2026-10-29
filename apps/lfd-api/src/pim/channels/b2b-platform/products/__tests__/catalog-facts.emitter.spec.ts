import {
  TransactionalDurablePublisher,
  TransactionalUnitOfWork,
} from "../../../../../platform/outbox/__tests__/transactional-durable.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  CatalogCategoryChangedFact,
  PIM_CATALOG_CATEGORY_CHANGED,
} from "../catalog-category-changed.fact.js";
import { B2bCatalogFactsEmitter } from "../catalog-facts.emitter.js";
import type { CatalogFamilyFactBody, CatalogProductFactBody } from "../catalog-facts.js";
import {
  CatalogProductChangedFact,
  PIM_CATALOG_PRODUCT_CHANGED,
} from "../catalog-product-changed.fact.js";
import { CatalogSnapshots } from "../catalog-snapshots.js";
import { PublicationSequence } from "../publication-sequence.js";

/**
 * L'émetteur (2a2, C4) : il verrouille trié,
 * relit APRÈS le verrou, tire un numéro par fait et écrit dans la boîte
 * d'envoi de la transaction.
 */

const NOW = new Date(Date.UTC(2030, 0, 1, 9));

/** Le journal des appels, dans l'ordre : c'est l'ordre qui est le sujet. */
class RecordingSequence extends PublicationSequence {
  readonly calls: string[] = [];
  private value = 40;

  constructor(private readonly existing: ReadonlySet<string>) {
    super();
  }
  lockProducts(ids: readonly string[]): Promise<string[]> {
    this.calls.push(`lock:products:${ids.join(",")}`);
    return Promise.resolve(ids.filter((id) => this.existing.has(id)));
  }
  lockCategories(ids: readonly string[]): Promise<string[]> {
    this.calls.push(`lock:categories:${ids.join(",")}`);
    return Promise.resolve(ids.filter((id) => this.existing.has(id)));
  }
  lockRules(): Promise<void> {
    this.calls.push("lock:rules");
    return Promise.resolve();
  }
  next(): Promise<number> {
    this.value += 1;
    this.calls.push(`next:${String(this.value)}`);
    return Promise.resolve(this.value);
  }
}

const FAMILY: CatalogFamilyFactBody = {
  id: "cat_1",
  name: "Viennoiseries",
  slug: "viennoiseries",
  parentId: null,
  position: 0,
  vatRatePercent: 5.5,
  audience: "both",
  archived: false,
  nameTranslations: {},
};

function body(id: string): CatalogProductFactBody {
  return {
    status: "inactive",
    audience: "both",
    audienceInherited: true,
    product: {
      id,
      sku: `SKU-${id}`,
      name: `Fiche ${id}`,
      categoryId: FAMILY.id,
      kind: "daily",
      note: null,
      noteTranslations: {},
      image: null,
      thumbnail: null,
      operationOnly: false,
      requiresCold: false,
      variantsAsTiles: true,
    },
    variants: [],
    gaps: { [`SKU-${id}-1`]: ["price"] },
    family: FAMILY,
  };
}

class TableSnapshots extends CatalogSnapshots {
  constructor(private readonly sequence: RecordingSequence) {
    super();
  }
  products(ids: readonly string[]): Promise<ReadonlyMap<string, CatalogProductFactBody>> {
    this.sequence.calls.push(`read:products:${ids.join(",")}`);
    return Promise.resolve(new Map(ids.map((id) => [id, body(id)])));
  }
  families(ids: readonly string[]): Promise<ReadonlyMap<string, CatalogFamilyFactBody>> {
    this.sequence.calls.push(`read:categories:${ids.join(",")}`);
    return Promise.resolve(new Map(ids.map((id) => [id, { ...FAMILY, id }])));
  }
}

function setup(existing: readonly string[]) {
  const uow = new TransactionalUnitOfWork();
  const sequence = new RecordingSequence(new Set(existing));
  const emitter = new B2bCatalogFactsEmitter(
    sequence,
    new TableSnapshots(sequence),
    new TransactionalDurablePublisher(uow),
    new FixedClock(NOW),
  );
  return { uow, sequence, emitter };
}

describe("B2bCatalogFactsEmitter", () => {
  it("verrouille trié et sans doublon, relit, PUIS tire un numéro par fait", async () => {
    const { uow, sequence, emitter } = setup(["p_a", "p_b"]);

    await uow.run(() => emitter.emitProducts(["p_b", "p_a", "p_b"]));

    expect(sequence.calls).toEqual([
      "lock:products:p_a,p_b",
      "read:products:p_a,p_b",
      "next:41",
      "next:42",
    ]);
    const facts = uow.of(PIM_CATALOG_PRODUCT_CHANGED);
    expect(facts.map((fact) => fact.key)).toEqual([
      "pim.catalog_product_changed:p_a:41",
      "pim.catalog_product_changed:p_b:42",
    ]);
    const first = CatalogProductChangedFact.fromPayload(facts[0]?.payload ?? {});
    expect(first).toMatchObject({ productId: "p_a", seq: 41, emittedAt: NOW.toISOString() });
    expect(first.body).toEqual(body("p_a"));
  });

  /** Lot 3 : un fait resté dans la boîte avant le champ se lit encore — « on ne sait pas ». */
  it("relit un fait émis avant `audienceInherited` en le disant inconnu", async () => {
    const { uow, emitter } = setup(["p_a"]);
    await uow.run(() => emitter.emitProducts(["p_a"]));
    const { audienceInherited: _dropped, ...older } = uow.of(PIM_CATALOG_PRODUCT_CHANGED)[0]
      ?.payload ?? { audienceInherited: null };

    expect(CatalogProductChangedFact.fromPayload(older).body.audienceInherited).toBeNull();
  });

  /** Fil v16 : un fait resté dans la boîte avant l'option se lit cochée — la valeur de la colonne. */
  it("relit un fait émis avant `variantsAsTiles` en le disant coché", async () => {
    const { uow, emitter } = setup(["p_a"]);
    await uow.run(() => emitter.emitProducts(["p_a"]));
    const payload = uow.of(PIM_CATALOG_PRODUCT_CHANGED)[0]?.payload ?? {};
    const { variantsAsTiles: _dropped, ...product } = payload["product"] as Record<string, unknown>;

    expect(
      CatalogProductChangedFact.fromPayload({ ...payload, product }).body.product.variantsAsTiles,
    ).toBe(true);
  });

  it("ignore une fiche que le verrou ne trouve pas, sans tirer de numéro pour elle", async () => {
    const { uow, sequence, emitter } = setup(["p_a"]);

    await uow.run(() => emitter.emitProducts(["p_a", "p_gone"]));

    expect(sequence.calls.filter((call) => call.startsWith("next:"))).toEqual(["next:41"]);
    expect(uow.of(PIM_CATALOG_PRODUCT_CHANGED)).toHaveLength(1);
  });

  it("émet une famille sous son propre numéro, avec sa forme de fil", async () => {
    const { uow, emitter } = setup(["cat_1"]);

    await uow.run(() => emitter.emitCategories(["cat_1"]));

    const [fact] = uow.of(PIM_CATALOG_CATEGORY_CHANGED);
    expect(fact?.key).toBe("pim.catalog_category_changed:cat_1:41");
    expect(CatalogCategoryChangedFact.fromPayload(fact?.payload ?? {}).family).toEqual(FAMILY);
  });

  /** Un fait sans transaction survivrait à une écriture annulée. */
  it("refuse d'émettre hors d'une unité de travail", async () => {
    const { emitter } = setup(["p_a"]);

    await expect(emitter.emitProducts(["p_a"])).rejects.toThrow(RangeError);
  });
});
