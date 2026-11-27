import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import {
  OptionGroupArchivedError,
  OptionGroupNotFoundError,
} from "../../../../reference/product-options/domain/errors/option-group-errors.js";
import {
  OptionGroupOffers,
  type OptionGroupOffer,
} from "../../../../reference/product-options/domain/ports/option-group-offers.reader.js";
import { RecordingCatalogEmitter } from "../../../../shared/__tests__/catalog-emitter-doubles.js";
import {
  ProductOptionActivations,
  type OptionActivationSnapshot,
} from "../../domain/entities/product-option-activations.js";
import { ArchivedProductNotEditableError } from "../../domain/errors/archived-product-edit-errors.js";
import { ProductNotFoundError } from "../../domain/errors/product-errors.js";
import { ProductOptionActivationRepository } from "../../domain/ports/product-option-activation.repository.js";
import {
  ProductOptionActivationsReader,
  type ActiveOptionActivation,
} from "../../domain/ports/product-option-activations.reader.js";
import {
  bareVariant,
  OneProduct,
  PRODUCT_ID,
  tarte,
} from "../../shared/__tests__/audience-doubles.js";
import {
  ActivateProductOptionGroupCommand,
  ActivateProductOptionGroupHandler,
} from "../activate-product-option-group.js";
import {
  DeactivateProductOptionGroupCommand,
  DeactivateProductOptionGroupHandler,
} from "../deactivate-product-option-group.js";
import {
  ListProductOptionGroupsHandler,
  ListProductOptionGroupsQuery,
} from "../list-product-option-groups.js";

/**
 * Activer un groupe d'options sur une fiche (`plan-options-de-commande.md`,
 * § 3.1) : l'agrégat refuse, l'écriture suit, le fait de la fiche part dans
 * la même unité de travail ; un geste sans effet se tait au journal.
 */

/** Les activations gardées par fiche — et relues comme la vraie table, actives seules. */
class StoredActivations extends ProductOptionActivationRepository {
  readonly rows = new Map<string, readonly OptionActivationSnapshot[]>();
  writes = 0;
  load(productId: string): Promise<ProductOptionActivations> {
    return Promise.resolve(
      ProductOptionActivations.reconstitute(productId, this.rows.get(productId) ?? []),
    );
  }
  save(activations: ProductOptionActivations): Promise<void> {
    this.writes += 1;
    this.rows.set(activations.productId, activations.snapshot());
    return Promise.resolve();
  }
}

class ActiveFromStore extends ProductOptionActivationsReader {
  constructor(private readonly store: StoredActivations) {
    super();
  }
  activeOf(
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, readonly ActiveOptionActivation[]>> {
    const found = new Map<string, readonly ActiveOptionActivation[]>();
    for (const id of ids) {
      const active = (this.store.rows.get(id) ?? []).filter((row) => row.revokedAt === null);
      if (active.length > 0) {
        found.set(
          id,
          active.map((row) => ({
            groupId: row.groupId,
            variantIds: row.allVariants ? null : row.variantIds,
          })),
        );
      }
    }
    return Promise.resolve(found);
  }
}

class KnownGroups extends OptionGroupOffers {
  constructor(private readonly groups: readonly OptionGroupOffer[]) {
    super();
  }
  describe(ids: readonly string[]): Promise<readonly OptionGroupOffer[]> {
    return Promise.resolve(this.groups.filter((group) => ids.includes(group.id)));
  }
}

const NOW = new Date("2026-11-19T09:00:00.000Z");
const TRANCHAGE: OptionGroupOffer = {
  id: "grp_tranchage",
  name: "Tranchage",
  archived: false,
  choices: [{ key: "tranche", label: "Tranché", audience: "both" }],
};
const RETIRED: OptionGroupOffer = {
  ...TRANCHAGE,
  id: "grp_retire",
  name: "Emballage",
  archived: true,
};

const WEIGHED_ID = "prd_tarte_v2";
const fiche = (status: "published" | "archived" = "published") =>
  tarte({
    status,
    variants: [
      bareVariant(),
      bareVariant({
        id: WEIGHED_ID,
        sku: "PAT-7-2",
        name: { fr: "Au poids" },
        isDefault: false,
        position: 1,
        saleUnit: "weight",
      }),
    ],
  });

function world(status: "published" | "archived" = "published") {
  const products = new OneProduct(fiche(status));
  const store = new StoredActivations();
  const offers = new KnownGroups([TRANCHAGE, RETIRED]);
  const journal = new RecordingJournal();
  const emitter = new RecordingCatalogEmitter();
  const uow = new DirectUnitOfWork();
  return {
    store,
    journal,
    emitter,
    activate: new ActivateProductOptionGroupHandler(products, store, offers, journal, uow, emitter),
    deactivate: new DeactivateProductOptionGroupHandler(
      products,
      store,
      offers,
      journal,
      new FixedClock(NOW),
      uow,
      emitter,
    ),
    list: new ListProductOptionGroupsHandler(new ActiveFromStore(store), offers),
  };
}

const activate = (
  w: ReturnType<typeof world>,
  variantIds: readonly string[] | null,
  group = TRANCHAGE.id,
) => w.activate.execute(new ActivateProductOptionGroupCommand(PRODUCT_ID, group, variantIds));

describe("ActivateProductOptionGroupHandler", () => {
  it("active sur une déclinaison au poids, journalise ses noms, émet la fiche", async () => {
    const w = world();
    await activate(w, [WEIGHED_ID]);

    expect(w.store.rows.get(PRODUCT_ID)).toEqual([
      { groupId: TRANCHAGE.id, allVariants: false, variantIds: [WEIGHED_ID], revokedAt: null },
    ]);
    expect(w.journal.types()).toEqual(["product.option_group_activated"]);
    expect(w.journal.entries[0]?.payload).toEqual({
      subjectLabel: "Tarte au citron",
      name: "Tranchage",
      variants: ["Au poids"],
    });
    expect(w.emitter.products).toEqual([[PRODUCT_ID]]);
  });

  it("pour toutes les déclinaisons, le journal dit `null`", async () => {
    const w = world();
    await activate(w, null);
    expect(w.journal.entries[0]?.payload).toMatchObject({ variants: null });
  });

  it("rejouée à l'identique : le journal se tait, le fait repart", async () => {
    const w = world();
    await activate(w, null);
    await activate(w, null);
    expect(w.journal.types()).toEqual(["product.option_group_activated"]);
    expect(w.emitter.products).toHaveLength(2);
  });

  it("une fiche archivée refuse, sans écrire ni émettre", async () => {
    const w = world("archived");
    await expect(activate(w, null)).rejects.toThrow(ArchivedProductNotEditableError);
    expect(w.store.writes).toBe(0);
    expect(w.emitter.products).toEqual([]);
  });

  it("un groupe archivé refuse ; un groupe inconnu aussi", async () => {
    const w = world();
    await expect(activate(w, null, RETIRED.id)).rejects.toThrow(OptionGroupArchivedError);
    await expect(activate(w, null, "grp_absent")).rejects.toThrow(OptionGroupNotFoundError);
    expect(w.store.writes).toBe(0);
  });

  it("une fiche inconnue refuse", async () => {
    const w = world();
    await expect(
      w.activate.execute(new ActivateProductOptionGroupCommand("prd_absent", TRANCHAGE.id, null)),
    ).rejects.toThrow(ProductNotFoundError);
  });
});

describe("DeactivateProductOptionGroupHandler", () => {
  it("retire, journalise et émet ; rejouée, ne fait plus rien", async () => {
    const w = world();
    await activate(w, null);
    const command = new DeactivateProductOptionGroupCommand(PRODUCT_ID, TRANCHAGE.id);

    await w.deactivate.execute(command);
    await w.deactivate.execute(command);

    expect(w.store.rows.get(PRODUCT_ID)?.[0]?.revokedAt).toEqual(NOW);
    expect(w.journal.types()).toEqual([
      "product.option_group_activated",
      "product.option_group_deactivated",
    ]);
    expect(w.emitter.products).toHaveLength(2);
  });
});

describe("ListProductOptionGroupsHandler", () => {
  it("rend les groupes actifs, un groupe archivé depuis marqué, un retiré absent", async () => {
    const w = world();
    await activate(w, [WEIGHED_ID]);
    w.store.rows.set(PRODUCT_ID, [
      ...(w.store.rows.get(PRODUCT_ID) ?? []),
      { groupId: RETIRED.id, allVariants: true, variantIds: [], revokedAt: null },
      { groupId: "grp_ancien", allVariants: true, variantIds: [], revokedAt: NOW },
    ]);

    expect(await w.list.execute(new ListProductOptionGroupsQuery(PRODUCT_ID))).toEqual([
      { groupId: TRANCHAGE.id, name: "Tranchage", archived: false, variantIds: [WEIGHED_ID] },
      { groupId: RETIRED.id, name: "Emballage", archived: true, variantIds: null },
    ]);
  });
});
