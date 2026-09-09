import { averageGapBp as averageBp, gapBp } from "@lfd/money";
import {
  CATALOG_CATEGORY_LABELS,
  CATALOG_CATEGORY_ORDER,
  type CompanyPricingCategoryView,
  type CompanyPricingView,
  type PricingItemView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { CustomerVolumeReader } from "../../domain/ports/customer-volume.reader.js";
import { VolumeLadderReader } from "../../domain/ports/volume-ladder.reader.js";
import { PricedCompanyNotFoundError } from "../../domain/pricing-errors.js";
import { unarchivedAt } from "../../infrastructure/archived-at.js";
import {
  floorFromRow,
  floorViewFromRow,
  ruleFromRow,
  ruleViewFromRow,
} from "../../infrastructure/price-rows.js";
import { BoardElasticityService } from "../board-elasticity.service.js";
import { boardMaterials, itemView, type LoadedFloor, type LoadedRule } from "../board-item.js";
import { groupByCategory } from "../board-category.js";
import { referenceCanonicalFor } from "../floor-reference.js";
import { posedMercurialeView } from "../posed-mercuriale-view.js";
import { pricingContextFor } from "../../domain/pricing-context.js";
import { CompanyMercurialeReader } from "../../domain/ports/company-mercuriale.reader.js";

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
    private readonly prisma: PrismaService,
    private readonly catalog: ProductCatalogReader,
    private readonly ladders: VolumeLadderReader,
    private readonly mercuriales: CompanyMercurialeReader,
    private readonly elasticity: BoardElasticityService,
    private readonly customerVolumes: CustomerVolumeReader,
    private readonly clock: Clock,
  ) {}

  /** @throws {PricedCompanyNotFoundError} l'identifiant ne désigne aucune société. */
  async forCompany(companyId: string): Promise<CompanyPricingView> {
    // Un seul instant pour toute la lecture : l'âge d'une limite, la fenêtre
    // d'une mercuriale et la résolution des prix doivent parler du même.
    const at = this.clock.now();
    await this.assertCompanyExists(companyId);

    const [ruleRows, floorRows, ladders, articles, mercuriales, live] = await Promise.all([
      this.prisma.priceRule.findMany({
        // 🔴 Le filtre d'audience est ici, dans la REQUÊTE, et non plus loin :
        // une règle d'un tiers qui entrerait dans le matériau pourrait gagner
        // son étage, et le prix rendu serait celui d'un autre client.
        where: { AND: [unarchivedAt(at), audienceOf(companyId)] },
        orderBy: [{ stage: "asc" }, { validFrom: "asc" }],
      }),
      // 🔴 **La fenêtre, en plus du rangement.** Depuis que la limite est
      // versionnée (R17), une portée porte N lignes — une par période — et
      // `ownFloor` n'en montre qu'une, par un `find` sur la portée : sans ce
      // filtre, il rendait la PREMIÈRE venue, donc la limite d'AVANT une
      // re-pose, avec son signal de dérive, sur l'écran où l'on négocie.
      //
      // ⚠️ Le prix, lui, était juste : `resolveScopedFloor` filtre par fenêtre
      // avant d'arbitrer la portée. C'est ce qui rendait le défaut discret —
      // l'écran contredisait son propre chiffre sans que rien ne le signale.
      //
      // Troisième lecteur du même oubli, et le seul que les e2e de R17
      // n'avaient pas attrapé : ils posaient deux fois sur le tableau général,
      // jamais sur une fiche client (corrigé le 2026-09-09).
      this.prisma.priceFloor.findMany({
        where: {
          AND: [
            unarchivedAt(at),
            { validFrom: { lte: at } },
            { OR: [{ validTo: null }, { validTo: { gt: at } }] },
          ],
        },
      }),
      this.ladders.listAll(at),
      this.catalog.all(),
      // Ce qu'on a DÉCIDÉ chez ce client — en cours, à venir, terminées.
      this.mercuriales.listFor(companyId),
      // Ce qui AGIT maintenant : c'est elle, et elle seule, qui entre dans le
      // prix. Deux questions, deux lectures — cf. le port.
      this.mercuriales.liveFor(companyId, at),
    ]);

    const rules: LoadedRule[] = ruleRows.map((row) => ({
      rule: ruleFromRow(row),
      view: ruleViewFromRow(row),
    }));
    const floors: LoadedFloor[] = floorRows.map((row) => {
      const floor = floorFromRow(row);
      return {
        floor,
        view: floorViewFromRow(row, referenceCanonicalFor(floor.scope, articles), at),
      };
    });

    const names = new Map(articles.map((article) => [article.sku, article.name]));
    const materials = boardMaterials(rules, floors, at, live, ladders, companyId);
    const byCategory = groupByCategory(articles);
    const categories: CompanyPricingCategoryView[] = CATALOG_CATEGORY_ORDER.map((category) => ({
      id: category,
      name: CATALOG_CATEGORY_LABELS[category],
      items: (byCategory.get(category) ?? []).map((article) =>
        itemView(
          article.article,
          pricingContextFor(article.sku, article.category, 1, { companyId }, at),
          materials,
          { rules, floors },
        ),
      ),
    })).filter((category) => category.items.length > 0);

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

    const sealed = measured.flatMap((category) =>
      category.items.filter((item) => item.sealedByRuleId !== null),
    );

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
        ),
      ),
      negotiatedSkuCount: sealed.length,
      averageGapBp: averageGapBp(sealed),
    };
  }

  /**
   * Une société inconnue ne filtre RIEN : la lecture rendrait le catalogue
   * entier au tarif de liste, c'est-à-dire un écran plausible affirmant « ce
   * client paie le tarif public ». Le refus est le seul endroit où les deux se
   * distinguent.
   */
  private async assertCompanyExists(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (company === null) {
      throw new PricedCompanyNotFoundError(companyId);
    }
  }
}

/** Les règles que ce client peut se voir appliquer : les siennes, et celles de tous. */
function audienceOf(companyId: string): {
  OR: [{ audienceType: "all" }, { audienceType: "company"; audienceId: string }];
} {
  // `segment` est volontairement absent : aucune société ne porte de segment
  // aujourd'hui (cf. `pricing-context.ts`), donc une règle de segment ne peut
  // viser personne. L'inclure ferait apparaître dans le dossier d'un client des
  // règles dont on sait qu'elles ne s'appliqueront pas à lui.
  return { OR: [{ audienceType: "all" }, { audienceType: "company", audienceId: companyId }] };
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
