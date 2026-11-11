import { averageGapBp as averageBp, gapBp } from "@lfd/money";
import {
  type CompanyPricingCategoryView,
  type CompanyPricingView,
  type PricingItemView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { CustomerVolumeReader } from "../../domain/ports/customer-volume.reader.js";
import { PricedCompanyNotFoundError } from "../../domain/pricing-errors.js";
import { BoardElasticityService } from "../board-elasticity.service.js";
import { PricedCompanyReader } from "../../domain/ports/priced-company.reader.js";
import { posedMercurialeView } from "../posed-mercuriale-view.js";
import { CompanyMercurialeReader } from "../../domain/ports/company-mercuriale.reader.js";
import type { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import { PricingPartiesResolver } from "../pricing-parties.resolver.js";
import { CompanyPriceSheets } from "../ports/company-price-sheet.js";

/**
 * **Ce que paie UN client**, article par article — la lecture de l'onglet
 * « Tarifs » d'une fiche compte.
 *
 * ## Pourquoi ce n'est pas le tableau général avec un paramètre
 *
 * Le tableau de tarification est lu à l'audience `all`, et il le sera toujours :
 * sa question est « qu'est-ce qui joue sur ce prix », toutes audiences
 * confondues. Il liste donc, sur chaque article, **toutes** les règles qui le
 * visent — les mercuriales des autres clients comprises. C'est ce qu'on veut en
 * réglant les prix publics ; c'est faux dans un dossier client, où chaque ligne
 * affirme « voici ce qui s'applique à lui ».
 *
 * Le filtre est donc posé **avant la résolution**, sur le matériau : seules
 * entrent les règles ouvertes à tous et celles qui visent nommément cette
 * société. Une règle d'un tiers ne peut alors ni gagner un étage, ni évincer,
 * ni apparaître dans une trace — la garantie est structurelle plutôt que
 * surveillée à l'affichage.
 *
 * ## Ce qui n'est PAS refait ici
 *
 * Le prix vient de `itemView`, **la même composition que le tableau général**,
 * qui appelle elle-même `resolvePrice`, la fonction qui facture. Une seconde
 * dérivation « pour le dossier client » aurait fini par annoncer autre chose
 * que la caisse, et c'est exactement ce qu'un client conteste au téléphone.
 *
 * ## Pourquoi pas de lecture datée
 *
 * Le tableau général se lit à une date parce qu'il sert à comprendre une
 * décision passée. Ce dossier-ci répond à « que paie-t-il, là, maintenant » —
 * la seule question qu'on se pose en décrochant. Le passé d'un prix a déjà deux
 * réponses meilleures : la frise pour les décisions, la trace figée sur la
 * ligne de commande pour ce qui a été facturé.
 */
@Injectable()
export class CompanyPricingQuery {
  constructor(
    private readonly companies: PricedCompanyReader,
    private readonly mercuriales: CompanyMercurialeReader,
    private readonly elasticity: BoardElasticityService,
    private readonly customerVolumes: CustomerVolumeReader,
    private readonly clock: Clock,
    private readonly staffAuthors: StaffAuthorDirectory,
    private readonly parties: PricingPartiesResolver,
    private readonly sheets: CompanyPriceSheets,
  ) {}

  /** @throws {PricedCompanyNotFoundError} l'identifiant ne désigne aucune société. */
  async forCompany(companyId: string): Promise<CompanyPricingView> {
    // Un seul instant pour toute la lecture : l'âge d'une limite, la fenêtre
    // d'une mercuriale et la résolution des prix doivent parler du même.
    const at = this.clock.now();
    await this.assertCompanyExists(companyId);
    // Le compte de tarif À CET INSTANT : un sous-compte qui suit son principal
    // paie la mercuriale du principal (`sous-comptes.md`, §2.2).
    // Porte inconnue : la fiche est lue par le staff, pas par le client.
    const parties = await this.parties.partiesAt(companyId, at, "unknown");

    const [sheet, mercuriales, live] = await Promise.all([
      this.sheets.sheetFor(companyId, parties, at),
      // Ce qu'on a DÉCIDÉ chez ce client — en cours, à venir, terminées.
      this.mercuriales.listFor(companyId),
      // Ce qui AGIT maintenant : c'est elle, et elle seule, qui entre dans le
      // prix. Deux questions, deux lectures — cf. le port. Lue sur le compte
      // de tarif : celle du principal tant que le sous-compte le suit.
      this.mercuriales.liveFor(parties.pricingCompanyId, at),
    ]);
    const { catalogue, rules } = sheet;
    const reservedElsewhere = new Set(
      catalogue.filter((article) => article.reservation === "other").map((article) => article.sku),
    );
    const names = new Map(catalogue.map((article) => [article.sku, article.name]));
    const categories = await sheet.categoriesWith(live);

    // 🔴 **L'effort de vente se mesure sur CE client, pas sur le marché.**
    //
    // Le tableau général demande « cette remise a-t-elle fait vendre plus ? » et
    // regarde les ventes de tout le monde. Ici la question est « ce client
    // commande-t-il assez pour que le prix que je lui ai accordé se paie ? »,
    // et y répondre avec les volumes des autres donnerait un objectif atteint
    // par des commandes qu'il n'a pas passées. `CustomerVolumeReader` existe
    // pour cette distinction, et son propre commentaire met en garde contre la
    // confusion.
    const measured = await this.elasticity.enrichCategories(
      categories,
      new Map(rules.map((entry) => [entry.rule.id, entry.rule.validFrom])),
      at,
      (skus, window) => this.customerVolumes.volumesFor(companyId, skus, window),
      // 🔴 TOUS les articles, pas seulement ceux dont le prix a déjà bougé.
      // Cet écran calcule l'effort d'un prix qu'on TAPE : sur un compte sans
      // mercuriale, aucun article n'a d'altération, et s'en tenir au défaut
      // laisserait la colonne vide sur la totalité du catalogue — muette au
      // moment précis où l'on négocie.
      () => true,
    );

    const mercurialeAuthors = await this.staffAuthors.identify(
      // Les auteurs des avenants aussi : le dossier les nomme sous la grille.
      mercuriales.flatMap((mercuriale) => [
        mercuriale.toPersistence().createdBy,
        ...mercuriale.amendments.map((amendment) => amendment.createdBy),
      ]),
    );
    const { firm, discounted } = sealedBy(measured, live, at);

    return {
      companyId,
      at: at.toISOString(),
      categories: measured,
      // Une PROJECTION, plus une reconstitution : la mercuriale est un objet
      // depuis le 2026-09-08, il n'y a plus de règles à recoller par libellé.
      mercuriales: mercuriales.map((mercuriale) =>
        posedMercurialeView(
          mercuriale,
          at,
          // Le nom du catalogue, ou le SKU nu : une mercuriale garde ses lignes
          // quand un article cesse d'être publié, et l'écran doit pouvoir dire
          // qu'elle ne vise plus rien.
          (sku) => names.get(sku) ?? sku,
          mercurialeAuthors,
          (sku) => reservedElsewhere.has(sku),
        ),
      ),
      negotiatedSkuCount: firm.length,
      generalDiscountSkuCount: discounted.length,
      averageGapBp: averageGapBp(firm),
    };
  }

  /**
   * Une société inconnue ne filtre RIEN : la lecture rendrait le catalogue
   * entier au tarif de liste, c'est-à-dire un écran plausible affirmant « ce
   * client paie le tarif public ». Le refus est le seul endroit où les deux se
   * distinguent.
   */
  private async assertCompanyExists(companyId: string): Promise<void> {
    if (!(await this.companies.exists(companyId))) {
      throw new PricedCompanyNotFoundError(companyId);
    }
  }
}

/**
 * **Les articles scellés, partagés en deux** (`la-remise-generale.md`, § 4) :
 * ceux qu'un prix ferme fait, et ceux que la remise générale de la mercuriale
 * vivante fait — scellés par elle, sans ligne de prix ferme à cet instant.
 * `negotiatedSkuCount` et `averageGapBp` gardent leur sens : les prix fermes.
 */
function sealedBy(
  categories: readonly CompanyPricingCategoryView[],
  live: CompanyMercuriale | null,
  at: Date,
): { readonly firm: PricingItemView[]; readonly discounted: PricingItemView[] } {
  const firmSkus = new Set(live?.linesAt(at).map((line) => line.sku) ?? []);
  const sealed = categories.flatMap((category) =>
    category.items.filter((item) => item.sealedByRuleId !== null),
  );
  const byDiscount = (item: PricingItemView): boolean =>
    live !== null && item.sealedByRuleId === live.id && !firmSkus.has(item.sku);
  return {
    firm: sealed.filter((item) => !byDiscount(item)),
    discounted: sealed.filter(byDiscount),
  };
}

/**
 * L'écart moyen au tarif catalogue sur les articles **scellés**, en points de
 * base. Positif = le client paie moins cher que le catalogue.
 *
 * Non pondéré : cette lecture ne connaît pas les volumes du client, et pondérer
 * par une quantité inventée donnerait un chiffre qui ressemble à une mesure.
 */
function averageGapBp(items: readonly PricingItemView[]): number | null {
  // La formule et le tri des inconnus vivent dans `@lfd/money` : la même
  // moyenne existait côté front, et les deux écrans pouvaient diverger.
  return averageBp(items.map((item) => gapBp(item.canonicalMillicents, item.finalMillicents)));
}
