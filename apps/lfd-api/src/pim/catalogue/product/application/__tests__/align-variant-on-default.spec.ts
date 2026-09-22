import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import type { VariantAspect, VariantSnapshot } from "../../domain/entities/variant.js";
import {
  AlignVariantOnDefaultCommand,
  AlignVariantOnDefaultHandler,
} from "../align-variant-on-default.js";

const PRODUCT_ID = "prd_1";
const DEFAULT_ID = "prd_1_v1";
const SECOND_ID = "prd_1_v2";

function aVariant(over: Partial<VariantSnapshot> = {}): VariantSnapshot {
  return {
    id: DEFAULT_ID,
    sku: "TAR-1-1",
    name: { fr: "Tarte" },
    options: {},
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: null,
    weightGrams: null,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    allergenSheet: null,
    nutrition: null,
    ...over,
  };
}

/** Une fiche, son défaut, et une seconde déclinaison née alignée sur les deux. */
function snapshot(second: Partial<VariantSnapshot> = {}): ProductSnapshot {
  return {
    id: PRODUCT_ID,
    sku: "TAR-1",
    name: { fr: "Tarte" },
    slug: { fr: "tarte" },
    kind: "daily",
    categoryId: "cat_1",
    status: "draft",
    vatByContext: {},
    channelOverride: null,
    variants: [
      aVariant(),
      aVariant({
        id: SECOND_ID,
        sku: "TAR-1-2",
        name: { fr: "Boîte de 220 g" },
        isDefault: false,
        position: 1,
        regulatoryFollowsDefault: true,
        nutritionFollowsDefault: true,
        ...second,
      }),
    ],
  };
}

/** Reconstitue à chaque lecture : le handler ne tient jamais notre instance. */
class FakeProducts extends ProductRepository {
  constructor(private stored: ProductSnapshot) {
    super();
  }
  findById(id: string): Promise<Product | null> {
    return Promise.resolve(id === this.stored.id ? Product.reconstitute(this.stored) : null);
  }
  listAll(): Promise<Product[]> {
    return Promise.resolve([]);
  }
  add(): Promise<void> {
    return Promise.resolve();
  }
  save(product: Product): Promise<void> {
    // L'instantané NON résolu, exactement comme l'adaptateur Prisma. `snapshot()`
    // résout l'héritage : l'écrire ici recopierait la fiche et le tarif du défaut
    // dans les colonnes PROPRES d'une déclinaison alignée — la faute 0b/0d du plan
    // `plan-separer-allergenes-et-nutrition.md`, rejouée par le double, qui rendait
    // vert ce que la vraie base refuse de faire (constaté le 2026-09-22).
    this.stored = product.persistenceSnapshot();
    return Promise.resolve();
  }
  variant(id: string): VariantSnapshot | undefined {
    return this.stored.variants.find((candidate) => candidate.id === id);
  }
}

function scene(second: Partial<VariantSnapshot> = {}): {
  readonly products: FakeProducts;
  readonly journal: RecordingJournal;
  readonly align: (aspect: VariantAspect, aligned: boolean) => Promise<void>;
} {
  const products = new FakeProducts(snapshot(second));
  const journal = new RecordingJournal();
  const handler = new AlignVariantOnDefaultHandler(products, journal, new DirectUnitOfWork());
  return {
    products,
    journal,
    align: (aspect, aligned) =>
      handler.execute(new AlignVariantOnDefaultCommand(PRODUCT_ID, SECOND_ID, aspect, aligned)),
  };
}

describe("les deux moitiés de la fiche s'alignent séparément", () => {
  /**
   * 🔴 Le cas qui motive le lot 4. Un drapeau unique faisait qu'une déclinaison
   * détachée pour saisir ses propres valeurs nutritionnelles perdait du même
   * geste les allergènes du défaut — sur de la donnée d'étiquette.
   */
  it("se détacher des valeurs laisse les allergènes alignés", async () => {
    const { products, align } = scene();

    await align("nutrition", false);

    expect(products.variant(SECOND_ID)).toMatchObject({
      nutritionFollowsDefault: false,
      regulatoryFollowsDefault: true,
    });
  });

  it("se détacher des allergènes laisse les valeurs alignées", async () => {
    const { products, align } = scene();

    await align("allergens", false);

    expect(products.variant(SECOND_ID)).toMatchObject({
      regulatoryFollowsDefault: false,
      nutritionFollowsDefault: true,
    });
  });
});

/**
 * `"regulatory"` est l'ancienne section entière : elle est déjà posée dans des
 * faits, et la version du back-office encore en ligne l'envoie. Elle reste
 * acceptée et vise le drapeau des allergènes tant que cette version tourne
 * (`plan-separer-allergenes-et-nutrition.md`, §6d).
 */
describe("l'ancienne valeur « regulatory » vise les allergènes", () => {
  it("détache les allergènes, et eux seuls", async () => {
    const { products, align } = scene();

    await align("regulatory", false);

    expect(products.variant(SECOND_ID)).toMatchObject({
      regulatoryFollowsDefault: false,
      nutritionFollowsDefault: true,
    });
  });

  /**
   * Le court-circuit « rien n'a changé » lit le MÊME drapeau que l'écriture.
   * Le comparer au mauvais aurait journalisé un fait qui n'a pas eu lieu, ou
   * tu un fait qui a eu lieu — et c'est cet historique qu'on vient relire le
   * jour où une étiquette est fausse.
   */
  it("ne journalise rien quand elle redit ce qui est déjà vrai", async () => {
    const { journal, align } = scene();

    await align("regulatory", true);

    expect(journal.types()).toEqual([]);
  });

  it("journalise la section DEMANDÉE, jamais celle qu'on a résolue", async () => {
    const { journal, align } = scene();

    await align("regulatory", false);

    expect(journal.entries[0]?.payload).toMatchObject({ aspect: "regulatory" });
  });
});

describe("la nouvelle section entre au journal", () => {
  it("écrit un fait « aligné » portant « nutrition »", async () => {
    const { journal, align } = scene({ nutritionFollowsDefault: false });

    await align("nutrition", true);

    expect(journal.entries[0]?.payload).toMatchObject({ aspect: "nutrition", aligned: true });
  });
});

/**
 * 🔴 **Ce que le double persistait, et que la vraie base ne persiste pas.**
 *
 * L'adaptateur Prisma écrit `persistenceSnapshot()` — chaque déclinaison avec
 * ce qu'elle PORTE. Le double écrivait `snapshot()`, qui RÉSOUT l'héritage :
 * une déclinaison alignée en ressortait avec la fiche et le tarif du défaut
 * recopiés dans ses colonnes propres. C'est mot pour mot la faute 0b/0d du plan
 * `plan-separer-allergenes-et-nutrition.md` — écrire une valeur résolue dans
 * une colonne propre — jouée par le double, donc invisible.
 *
 * Ce que ça coûtait : une régression qui ferait exactement ça en production
 * serait passée au vert ici, et se serait vue le jour où quelqu'un se
 * désaligne — la promesse « s'aligner puis se désaligner rend ce qu'on avait
 * écrit » aurait rendu la fiche du défaut à la place (constaté le 2026-09-22
 * par le bâtisseur du lot 4).
 */
describe("une écriture ne recopie pas le défaut dans les colonnes propres", () => {
  /** Le défaut déclare et tarife ; la seconde suit les deux, sans rien à elle. */
  function withDeclaredDefault(second: Partial<VariantSnapshot> = {}): FakeProducts {
    const base = snapshot({ pricingFollowsDefault: true, ...second });
    const [first, ...rest] = base.variants;
    return new FakeProducts({
      ...base,
      variants: [
        {
          ...first!,
          allergenSheet: { declared: ["AM"], mayContain: [] },
          priceCents: 250,
          weightGrams: 100,
        },
        ...rest,
      ],
    });
  }

  function alignmentOn(products: FakeProducts): AlignVariantOnDefaultHandler {
    return new AlignVariantOnDefaultHandler(
      products,
      new RecordingJournal(),
      new DirectUnitOfWork(),
    );
  }

  it("laisse la déclinaison alignée à « rien déclaré » dans sa propre colonne", async () => {
    const products = withDeclaredDefault();

    await alignmentOn(products).execute(
      new AlignVariantOnDefaultCommand(PRODUCT_ID, SECOND_ID, "nutrition", false),
    );

    // Elle hérite à la LECTURE ; en base elle ne porte rien, et c'est ce qui
    // rend le désalignement réversible.
    expect(products.variant(SECOND_ID)?.allergenSheet).toBeNull();
  });

  it("laisse son tarif propre vide quand elle suit celui du défaut", async () => {
    const products = withDeclaredDefault();

    await alignmentOn(products).execute(
      new AlignVariantOnDefaultCommand(PRODUCT_ID, SECOND_ID, "allergens", false),
    );

    expect(products.variant(SECOND_ID)).toMatchObject({
      priceCents: null,
      weightGrams: null,
      pricingFollowsDefault: true,
    });
  });
});
