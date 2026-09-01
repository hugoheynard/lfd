import { Test } from "@nestjs/testing";

import { AccountingRules } from "../../../../accounting-rules/domain/entities/accounting-rules.js";
import { ProPriceRatioNotSetError } from "../../../../accounting-rules/domain/errors/accounting-rules-errors.js";
import { AccountingRulesRepository } from "../../../../accounting-rules/domain/ports/accounting-rules.repository.js";
import {
  AllergenStore,
  InMemoryAllergenCatalogueReader,
} from "../../../../allergens/application/__tests__/in-memory-allergens.js";
import { AllergenCatalogueReader } from "../../../../allergens/domain/ports/allergen-catalogue.reader.js";
import { CatalogueReader } from "../../../../catalogue/shared/domain/ports/catalogue-reader.js";
import { B2bMembershipService } from "../../membership/membership.service.js";
import { B2bCatalogFeedProjection } from "../feed-projection.service.js";

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

async function build(options: {
  readonly publishedIds: readonly string[];
  readonly ratioBp: number | null;
  readonly catalogue: unknown;
}): Promise<B2bCatalogFeedProjection> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      B2bCatalogFeedProjection,
      { provide: CatalogueReader, useValue: options.catalogue },
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

describe("B2bCatalogFeedProjection — le rapport pro est une précondition", () => {
  it("refuse de projeter tant que le rapport n'est pas réglé", async () => {
    const service = await build({
      publishedIds: ["prd_1"],
      ratioBp: null,
      catalogue: CATALOGUE_NEVER_READ,
    });

    await expect(service.preview(AT)).rejects.toBeInstanceOf(ProPriceRatioNotSetError);
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
