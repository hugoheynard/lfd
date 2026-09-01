import { Injectable } from "@nestjs/common";
import { CATALOG_SNAPSHOT_VERSION } from "@lfd/catalog-sync";
import { SOURCE_LOCALE } from "@lfd/pim-contracts";

import { ProPriceRatioNotSetError } from "../../../accounting-rules/domain/errors/accounting-rules-errors.js";
import { AccountingRulesRepository } from "../../../accounting-rules/domain/ports/accounting-rules.repository.js";
import { AllergenCatalogueReader } from "../../../allergens/domain/ports/allergen-catalogue.reader.js";
import { IncoProjector } from "../../../allergens/domain/services/inco-projector.js";
import { CatalogueReader } from "../../../catalogue/shared/domain/ports/catalogue-reader.js";
import { B2bMembershipService } from "../membership/membership.service.js";
import { B2bCatalogFeedPreview, type FeedPreview } from "./feed-preview.js";
import { projectCatalog } from "./projection.js";

/** Un canal sans aucun produit publié — rien à envoyer, rien à comparer. */
const EMPTY_SNAPSHOT_PRODUCTS: readonly [] = [];

/**
 * Calcule ce que le canal B2B enverrait : appartenance, puis projection.
 *
 * Extrait du service de push, qui faisait les deux. La séparation n'est pas
 * cosmétique : depuis que la plateforme vit dans le même processus, elle veut
 * **regarder** cette projection sans provoquer d'envoi — un contrôle de parité
 * qui pousserait pour se rassurer serait un contrôle qui change ce qu'il
 * mesure.
 *
 * ## Le rapport pro est une PRÉCONDITION, pas une donnée de plus
 *
 * Le prix poussé est un hors taxe **professionnel** : prix public TTC × rapport,
 * puis ÷ taux du canal. Tant que le rapport n'est pas réglé, il n'y a pas de
 * prix pro — et ce service refuse plutôt que de pousser le plein tarif. Le
 * refus est ici et non dans la projection parce qu'il porte sur le PUSH entier :
 * écarter chaque article un par un produirait un snapshot vide, que la
 * plateforme accepterait en retirant de sa boutique tout ce qu'elle vendait.
 */
@Injectable()
export class B2bCatalogFeedProjection extends B2bCatalogFeedPreview {
  constructor(
    private readonly catalogue: CatalogueReader,
    private readonly membership: B2bMembershipService,
    private readonly accounting: AccountingRulesRepository,
    private readonly allergens: AllergenCatalogueReader,
  ) {
    super();
  }

  async preview(generatedAt: string): Promise<FeedPreview> {
    const productIds = await this.membership.publishedProductIds();
    if (productIds.length === 0) {
      return {
        snapshot: emptySnapshot(generatedAt),
        candidates: 0,
        excluded: [],
      };
    }

    // **Lu APRÈS le raccourci du canal vide.** Un canal où rien n'est publié
    // n'a rien à tarifer, et lui réclamer un réglage comptable refuserait un
    // aperçu qui n'a aucun prix à montrer.
    const rules = await this.accounting.read();
    if (rules === null) {
      throw new ProPriceRatioNotSetError();
    }

    const [products, categories] = await Promise.all([
      this.catalogue.byIds(productIds),
      this.catalogue.channelCategories(),
    ]);
    // Le taux ET les canaux effectifs de chaque fiche — sa dérogation par-dessus
    // celle de sa famille. Résolus ici, une fois, pour que la projection reste
    // pure.
    //
    // Le référentiel d'allergènes les rejoint, pour la même raison et **une
    // seule fois par projection** (D6) : la plateforme B2B n'a plus de quoi
    // traduire un code GS1 en mention d'étiquette, donc c'est le PIM qui
    // projette — mais `projectCatalog` reste pure, elle reçoit le projecteur.
    const [vatByProduct, channelsByProduct, allergenCatalogue] = await Promise.all([
      this.catalogue.vatPercents(products),
      this.catalogue.effectiveChannels(products),
      this.allergens.catalogue(),
    ]);
    const { snapshot, excluded } = projectCatalog(
      products,
      categories,
      vatByProduct,
      channelsByProduct,
      rules.rules.proPriceRatio.basisPoints,
      // Le canal est monolingue français : l'aplatissement se fait à l'émission
      // plutôt que de transporter un objet localisé que personne ne lira.
      IncoProjector.from(allergenCatalogue, SOURCE_LOCALE),
      generatedAt,
    );
    return { snapshot, candidates: productIds.length, excluded };
  }
}

/** Un snapshot vide mais **valide** : le contrat vaut aussi pour « rien ». */
function emptySnapshot(generatedAt: string): FeedPreview["snapshot"] {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt,
    categories: [],
    products: [...EMPTY_SNAPSHOT_PRODUCTS],
  };
}
