import { OrderTimeLimitRepository } from "../../../../order-time-limitation/domain/ports/order-time-limit.repository.js";
import { Test } from "@nestjs/testing";

import { AccountingRules } from "../../../../accounting-rules/domain/entities/accounting-rules.js";
import { AccountingRulesRepository } from "../../../../accounting-rules/domain/ports/accounting-rules.repository.js";
import {
  AllergenStore,
  InMemoryAllergenCatalogueReader,
} from "../../../../allergens/application/__tests__/in-memory-allergens.js";
import { AllergenCatalogueReader } from "../../../../allergens/domain/ports/allergen-catalogue.reader.js";
import { CatalogueReader } from "../../../../catalogue/shared/domain/ports/catalogue-reader.js";
import { B2bMembershipService } from "../../membership/membership.service.js";
import { B2bCatalogFeedProjection } from "../feed-projection.service.js";
import { EditorialReader } from "../../../../catalogue/product/domain/ports/editorial-reader.js";
import {
  Operation,
  type OperationSnapshot,
} from "../../../../operations/domain/entities/operation.js";
import { ImageCatalogue } from "../../../media/image-catalogue.js";
import { FocalImageCatalogue } from "../../../media/__tests__/focal-image-catalogue.js";
import { OperationReader } from "../../../../operations/domain/ports/operation.reader.js";

/**
 * **Le garde qui protège la boutique d'un réglage manquant.**
 *
 * Le prix poussé est un hors taxe PROFESSIONNEL. Sans rapport réglé, il n'y a
 * pas de prix pro — et les deux issues possibles sont mauvaises pour des
 * raisons opposées : pousser le plein tarif facture silencieusement le prix
 * public à tous les pros ; écarter chaque article produit un snapshot vide, que
 * la plateforme accepte en **retirant de sa boutique** tout ce qu'elle vendait.
 *
 * D'où un refus, et un refus qui porte sur le push entier.
 *
 * Les doublures passent par `useValue` plutôt que par une classe de test : le
 * service dépend de `B2bMembershipService`, une classe CONCRÈTE dont le
 * constructeur réclame Prisma. C'est le motif déjà employé par
 * `push.service.spec.ts`, et il évite le `as unknown as` que l'alternative
 * demanderait.
 */
const AT = "2026-08-31T08:00:00.000Z";

/** Le lecteur de catalogue ne DOIT pas être sollicité quand le garde refuse. */
const CATALOGUE_NEVER_READ = {
  byIds: () => {
    throw new Error("Le catalogue a été lu alors que le rapport manquait.");
  },
  channelCategories: () => {
    throw new Error("Le catalogue a été lu alors que le rapport manquait.");
  },
  vatPercents: () => {
    throw new Error("Le catalogue a été lu alors que le rapport manquait.");
  },
  effectiveChannels: () => {
    throw new Error("Le catalogue a été lu alors que le rapport manquait.");
  },
};

/** Un catalogue qui répond, et qui ne contient rien. */
const EMPTY_CATALOGUE = {
  byIds: () => Promise.resolve([]),
  channelCategories: () => Promise.resolve([]),
  vatPercents: () => Promise.resolve(new Map()),
  effectiveChannels: () => Promise.resolve(new Map()),
};

/** Les opérations datées tenues en table — aucune, sauf pour le point focal (L10). */
class TableOperations extends OperationReader {
  constructor(private readonly operations: readonly OperationSnapshot[] = []) {
    super();
  }

  list(): Promise<readonly OperationSnapshot[]> {
    return Promise.resolve(this.operations);
  }

  find(): Promise<OperationSnapshot | null> {
    return Promise.resolve(null);
  }
}

async function build(options: {
  readonly publishedIds: readonly string[];
  readonly ratioBp: number | null;
  readonly catalogue: unknown;
  readonly operations?: readonly OperationSnapshot[];
  readonly images?: ImageCatalogue;
}): Promise<B2bCatalogFeedProjection> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      B2bCatalogFeedProjection,
      { provide: CatalogueReader, useValue: options.catalogue },
      { provide: OperationReader, useValue: new TableOperations(options.operations) },
      { provide: ImageCatalogue, useValue: options.images ?? new FocalImageCatalogue() },
      // Aucune limite de commande déclarée : le sujet de cette suite est le
      // rapport pro, pas l'heure. Un double vide plutôt qu'un cas de plus.
      { provide: OrderTimeLimitRepository, useValue: { list: () => Promise.resolve([]) } },
      // Ni éditorial ni visuel : même raison. La vitrine a son propre fichier.
      {
        provide: EditorialReader,
        useValue: {
          findByProducts: () => Promise.resolve(new Map()),
          mediaOfProducts: () => Promise.resolve(new Map()),
        },
      },
      {
        provide: B2bMembershipService,
        useValue: { publishedProductIds: () => Promise.resolve([...options.publishedIds]) },
      },
      {
        provide: AllergenCatalogueReader,
        useValue: new InMemoryAllergenCatalogueReader(new AllergenStore()),
      },
      {
        provide: AccountingRulesRepository,
        useValue: {
          read: () =>
            Promise.resolve(
              options.ratioBp === null
                ? null
                : { rules: AccountingRules.open(options.ratioBp), updatedAt: new Date(AT) },
            ),
        },
      },
    ],
  }).compile();
  return moduleRef.get(B2bCatalogFeedProjection);
}

describe("B2bCatalogFeedProjection — le rapport pro n'est plus une précondition (lot S)", () => {
  /**
   * Régression (BLOQUANT `vitruve`, 2026-10-16) : sans ligne de règles, le push
   * refusait (`ProPriceRatioNotSetError`) et aucune saisie ne partait. Une base
   * sans règles vaut désormais « prix saisi » sans rapport.
   */
  it("projette sans règles comptables : la base vaut « prix saisi »", async () => {
    const service = await build({
      publishedIds: ["prd_1"],
      ratioBp: null,
      catalogue: EMPTY_CATALOGUE,
    });

    const preview = await service.preview(AT);
    expect(preview.candidates).toBe(1);
  });

  /**
   * Le raccourci du canal vide passe AVANT le garde : un canal où rien n'est
   * publié n'a aucun prix à montrer, et lui réclamer un réglage comptable
   * refuserait un aperçu qui ne tarife rien.
   */
  it("rend un snapshot vide sans réclamer de rapport quand rien n'est publié", async () => {
    const service = await build({
      publishedIds: [],
      ratioBp: null,
      catalogue: CATALOGUE_NEVER_READ,
    });

    const preview = await service.preview(AT);
    expect(preview.snapshot.products).toEqual([]);
    expect(preview.candidates).toBe(0);
  });

  it("projette dès que le rapport existe", async () => {
    const service = await build({
      publishedIds: ["prd_1"],
      ratioBp: 9_000,
      catalogue: EMPTY_CATALOGUE,
    });

    // Rien à projeter — le point est qu'aucun refus n'est levé, et que le
    // catalogue EST lu cette fois.
    const preview = await service.preview(AT);
    expect(preview.candidates).toBe(1);
    expect(preview.snapshot.products).toEqual([]);
  });
});

describe("B2bCatalogFeedProjection — le point focal des opérations (L10)", () => {
  const IMAGE = "https://media.example/noel.jpg";

  function noel(): OperationSnapshot {
    const operation = Operation.prepare({
      key: "noel-2026",
      name: { fr: "Noël" },
      lede: null,
      image: { url: IMAGE, alt: "Une bûche" },
      schedule: {
        announceFrom: new Date("2026-10-31T23:00:00.000Z"),
        orderFrom: null,
        orderUntil: new Date("2026-12-21T11:00:00.000Z"),
        pickupFrom: "2026-12-20",
        pickupUntil: "2026-12-24",
      },
      audience: "both",
    });
    return operation.snapshot();
  }

  it("lit le point à la médiathèque au moment du push, et le fait voyager", async () => {
    const images = new FocalImageCatalogue(new Map([[IMAGE, { x: 0.3, y: 0.7 }]]));
    const service = await build({
      publishedIds: [],
      ratioBp: null,
      catalogue: CATALOGUE_NEVER_READ,
      operations: [noel()],
      images,
    });

    const preview = await service.preview(AT);

    expect(preview.snapshot.operations[0]?.image).toEqual({
      url: IMAGE,
      alt: "Une bûche",
      focal: { x: 0.3, y: 0.7 },
    });
    expect(images.reads).toBe(1);
  });

  it("l'empreinte change quand le point bouge : le push suivant le porte", async () => {
    const at = (focal: { x: number; y: number } | null) =>
      build({
        publishedIds: [],
        ratioBp: null,
        catalogue: CATALOGUE_NEVER_READ,
        operations: [noel()],
        images: new FocalImageCatalogue(new Map([[IMAGE, focal]])),
      }).then((service) => service.preview(AT));

    const [centred, moved] = await Promise.all([at(null), at({ x: 0.1, y: 0.1 })]);

    expect(centred.snapshot.operations[0]?.image?.focal).toBeNull();
    expect(moved.fingerprint).not.toBe(centred.fingerprint);
  });

  it("ne lit pas la médiathèque quand aucune opération n'a d'image", async () => {
    const images = new FocalImageCatalogue();
    const service = await build({
      publishedIds: [],
      ratioBp: null,
      catalogue: CATALOGUE_NEVER_READ,
      images,
    });

    await service.preview(AT);

    expect(images.reads).toBe(0);
  });
});
