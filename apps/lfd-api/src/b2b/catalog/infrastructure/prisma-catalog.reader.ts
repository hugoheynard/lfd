import { categoryPathOf } from "@lfd/catalog-sync";
import { Injectable } from "@nestjs/common";
import type { OrderLineAllergens } from "@lfd/contracts";
import { htMillicentsOf } from "@lfd/money";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CatalogReader,
  type ResolvedCatalogItem,
  type ShopAudience,
} from "../domain/ports/catalog.reader.js";
import { PUBLIC_SALES_CONTEXT } from "../domain/public-context.js";
import { publicByContextOf } from "./public-by-context.js";
import { STILL_SOLD } from "./sellable-filter.js";

/**
 * ⚠️ **`findSku` reste au tarif `pro`, et c'est écrit plutôt que laissé par
 * défaut.**
 *
 * Il prend le SKU d'une DÉCLINAISON, là où le devis et la commande passent par
 * le SKU produit (`listDefaultsByProductSkus`), qui porte l'audience depuis le
 * lot A3. Aucun chemin public ne l'atteint aujourd'hui (2026-09-21).
 *
 * Un `"pro"` qu'on voit est une décision ; un défaut de signature est un oubli
 * en devenir — et sur un prix, un oubli se facture.
 */

/** La forme que Prisma rend, article + famille + décision locale éventuelle. */
interface ItemRow {
  readonly sku: string;
  readonly productSku: string;
  readonly name: string;
  readonly priceMillicents: number;
  readonly publicByContext: unknown;
  readonly isDefault: boolean;
  readonly position: number;
  readonly vatRatePercent: { toNumber: () => number } | null;
  readonly allergens: unknown;
  readonly allergenLabels: unknown;
  readonly note: string | null;
  readonly imageUrl: string | null;
  readonly thumbnailUrl: string | null;
  readonly thumbnailAlt: string | null;
  readonly thumbnailWidth: number | null;
  readonly thumbnailHeight: number | null;
  readonly imageAlt: string | null;
  readonly imageWidth: number | null;
  readonly imageHeight: number | null;
  readonly orderLimitDaysBefore: number | null;
  readonly orderLimitTime: string | null;
  readonly orderLimitGraceMinutes: number | null;
  // Le taux de la FAMILLE n'y figure plus : plus rien ici ne le lit. Le laisser
  // dans la forme suffirait à ce qu'un jour quelqu'un le relise « puisqu'il est
  // là ».
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly parentId: string | null;
    readonly position: number;
  };
  readonly override: {
    readonly priceMillicents: number | null;
    readonly decidedPublicTtcCents: number | null;
    readonly isHidden: boolean;
    readonly isHiddenPublic: boolean;
    readonly isFeatured: boolean;
  } | null;
}

/**
 * Compose le reçu et le décidé — **une seule fois, ici**.
 *
 * Laisser cette composition fuir vers les appelants donnerait autant de versions
 * de « quel prix s'applique » qu'il y a d'écrans, et la première divergence
 * serait un client qui voit un prix que le checkout refuse.
 */
@Injectable()
export class PrismaCatalogReader extends CatalogReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findSku(sku: string): Promise<ResolvedCatalogItem | null> {
    const row = await this.prisma.catalogItem.findUnique({
      where: { sku, ...STILL_SOLD },
      include: { category: true, override: true },
    });
    if (row === null || hiddenFrom(row, "pro")) {
      return null;
    }
    const served = servedPriceOf(row, "pro");
    return served === null ? null : resolve(row, served, await this.lineage([row]));
  }

  /** Une seule ligne visée par index, jamais le catalogue entier chargé puis filtré. */
  async findDefaultByProductSku(
    productSku: string,
    audience: ShopAudience,
  ): Promise<ResolvedCatalogItem | null> {
    const row = await this.prisma.catalogItem.findFirst({
      where: { productSku, isDefault: true, ...STILL_SOLD },
      include: { category: true, override: true },
    });
    if (row === null || hiddenFrom(row, audience)) {
      return null;
    }
    const served = servedPriceOf(row, audience);
    return served === null ? null : resolve(row, served, await this.lineage([row]));
  }

  async listDefaultsByProductSkus(
    productSkus: readonly string[],
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    if (productSkus.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.catalogItem.findMany({
      where: { productSku: { in: [...productSkus] }, isDefault: true, ...STILL_SOLD },
      include: { category: true, override: true },
    });
    const resolved = new Map<string, ResolvedCatalogItem>();
    const lineage = await this.lineage(rows);
    for (const row of rows) {
      const served = servedPriceOf(row, audience);
      if (hiddenFrom(row, audience) || served === null) {
        continue;
      }
      resolved.set(row.productSku, resolve(row, served, lineage));
    }
    return resolved;
  }

  async listSellable(audience: ShopAudience): Promise<ResolvedCatalogItem[]> {
    const rows = await this.prisma.catalogItem.findMany({
      where: {
        ...STILL_SOLD,
        // Deux conditions indépendantes, donc un `AND` explicite : deux clés
        // `OR` dans le même objet se seraient écrasées en silence.
        AND: [
          // 🔴 **Le masquage de CETTE audience.** La condition lisait `isHidden`
          // quel que soit le demandeur, donc masquer un article le retirait des
          // deux boutiques — le défaut que ce lot ferme (2026-09-21).
          {
            OR: [
              { override: null },
              audience === "pro"
                ? { override: { isHidden: false } }
                : {
                    override: { isHiddenPublic: false },
                  },
            ],
          },
          // Le mur : sans taux de TVA, on ne sait pas facturer. L'article reste
          // au catalogue et se voit dans le paramétrage ; il ne se vend pas.
          //
          // 🔴 Le taux de l'ARTICLE, et lui seul. Cette clause acceptait aussi
          // celui de la famille — cf. `billableRate`.
          { vatRatePercent: { not: null } },
        ],
      },
      include: { category: true, override: true },
      // 🔴 `sku` DÉPARTAGE, et ce n'est pas de la coquetterie : le référentiel
      // envoie `position: 0` sur **tous** les articles (vérifié le 2026-09-10 —
      // dix-neuf viennoiseries, dix-neuf zéros). Les deux premiers critères sont
      // donc à égalité sur tout un rayon, et Postgres rend alors l'ordre qu'il
      // veut : celui du tas, qui change dès qu'une ligne est réécrite. Poser un
      // prix faisait SAUTER l'article qu'on venait d'éditer.
      //
      // Le départage tient que `position` finisse garni ou non : un tri à
      // égalités n'est pas un tri.
      orderBy: [{ category: { position: "asc" } }, { position: "asc" }, { sku: "asc" }],
    });
    const lineage = await this.lineage(rows);
    return rows.flatMap((row) => {
      const served = servedPriceOf(row, audience);
      return served === null ? [] : [resolve(row, served, lineage)];
    });
  }

  /**
   * **La lignée des familles** des lignes lues.
   *
   * Une famille sans parente est sa propre lignée : c'est le cas de toutes au
   * 2026-09-26, et ce chemin ne coûte alors AUCUNE lecture de plus — le budget
   * du devis (`test/pricing-budget.e2e-spec.ts`) compte les allers-retours au
   * schéma, et la hiérarchie ne doit pas le payer tant qu'elle n'existe pas.
   *
   * Dès qu'une famille lue a une parente, le miroir est lu entier, en une
   * requête : il ne porte pas de relation vers le parent, seulement
   * `parent_id`, la profondeur n'est pas bornée, et la table tient en quelques
   * lignes. La descente est celle de l'heure limite (`categoryPathOf`) — une
   * seconde implémentation finirait par diverger.
   */
  private async lineage(rows: readonly ItemRow[]): Promise<Lineage> {
    if (rows.every((row) => row.category.parentId === null)) {
      return (familyId) => [familyId];
    }
    const families = await this.prisma.catalogCategory.findMany({
      select: { id: true, parentId: true },
    });
    const nodes = families.map((family) => ({ id: family.id, parentId: family.parentId }));
    const cache = new Map<string, readonly string[]>();
    return (familyId) => {
      const known = cache.get(familyId);
      if (known !== undefined) {
        return known;
      }
      const path = categoryPathOf(nodes, familyId);
      cache.set(familyId, path);
      return path;
    };
  }
}

/** La lignée d'une famille, la famille en tête. */
type Lineage = (familyId: string) => readonly string[];

/**
 * **L'article est-il masqué POUR CETTE AUDIENCE ?**
 *
 * 🔴 **Quatre sites posaient cette question, et aucun ne la posait ainsi.** Ils
 * lisaient `isHidden` quel que soit le demandeur — le rayon, la fiche, le lot de
 * SKU, la commande. Rendre le seul `listSellable` conscient de l'audience aurait
 * fait diverger le rayon et la caisse : un article masqué au pro se serait
 * affiché au public et aurait échoué au panier ; un article masqué au public
 * serait resté achetable. Deux bugs de vente, dans les deux sens (relevé par
 * `vitruve` le 2026-09-21, avant qu'une ligne soit écrite).
 *
 * Elle est donc UNE fonction, et les quatre l'appellent.
 */
function hiddenFrom(row: ItemRow, audience: ShopAudience): boolean {
  const override = row.override;
  if (override === null || override === undefined) {
    return false;
  }
  return audience === "pro" ? override.isHidden : override.isHiddenPublic;
}

/** L'entrée du pipeline de prix, et le taux qui l'accompagne. */
interface ServedPrice {
  readonly unitPriceMillicents: number;
  readonly pimPriceMillicents: number;
  readonly vatRate: number;
}

/**
 * **Ce qu'on sert à qui regarde** — l'unique endroit où l'audience change le
 * prix, et c'est tout ce qu'elle change.
 *
 * Au `pro` : le tarif de son canal. La décision locale gagne quand elle existe,
 * sinon le prix du référentiel. Les deux sont rendus — un écran qui ne verrait
 * que le prix final ne pourrait pas dire « prix PIM 2,40 € · prix B2B 2,10 € »,
 * et un prix sans provenance ne se défend pas devant un client qui le conteste.
 *
 * Au `public` : **l'étiquette**, mise hors taxe au taux de son contexte — celle
 * décidée ici quand il y en a une, celle du référentiel sinon. Et surtout **pas
 * le prix PRO** : il naît d'une négociation, et le servir à un particulier lui
 * appliquerait une décision qui n'est pas la sienne.
 *
 * 🔴 **Les deux audiences ont chacune leur décision, et elles ne se touchent
 * pas.** `priceMillicents` est l'entrée du canal professionnel,
 * `decidedPublicTtcCents` celle du public. Lire l'une pour l'autre est
 * exactement le défaut que ce chantier ferme.
 *
 * ⚠️ **La conversion a lieu ICI, à la lecture, et pas à la pose.** Le taux
 * appliqué est donc celui que le miroir porte AU MOMENT DE SERVIR — un push qui
 * change le taux d'un contexte change le hors taxe servi, sans qu'on ait à
 * retoucher le prix posé. C'est ce qu'on veut : le prix posé est un TTC, et un
 * TTC ne bouge pas quand la taxe bouge.
 *
 * 🔴 **`null` = pas vendable à cette audience, et on n'invente rien.** Un
 * article sans taux ne se facture pas ; un article dont le référentiel n'a pas
 * encore poussé le prix public ne se vend pas au public — le servir au tarif
 * pro serait exactement le défaut que ce chantier ferme. Un push complet du
 * référentiel remplit les deux.
 */
function servedPriceOf(row: ItemRow, audience: ShopAudience): ServedPrice | null {
  const pimPriceMillicents = row.priceMillicents;
  if (audience === "pro") {
    const vatRate = billableRate(row);
    return vatRate === null
      ? null
      : {
          unitPriceMillicents: row.override?.priceMillicents ?? pimPriceMillicents,
          pimPriceMillicents,
          vatRate,
        };
  }
  const price = publicByContextOf(row.publicByContext)?.[PUBLIC_SALES_CONTEXT];
  if (price === undefined) {
    return null;
  }
  const decided = row.override?.decidedPublicTtcCents ?? null;
  const decidedMillicents = decided === null ? null : htMillicentsOf(decided, price.vatRatePercent);
  return {
    unitPriceMillicents: decidedMillicents ?? price.htMillicents,
    // 🔴 **Le tarif de référence suit le prix servi, il ne reste pas en
    // arrière.** Si seul `unitPriceMillicents` devenait la décision, la vitrine
    // publique barrerait l'étiquette du PIM — c'est-à-dire annoncerait une
    // remise que personne n'a accordée, sur une page servie sans jeton. Le
    // « prix barré » n'apparaît que lorsque la RÉSOLUTION baisse le prix, et
    // c'est son seul cas légitime.
    pimPriceMillicents: decidedMillicents ?? price.htMillicents,
    vatRate: price.vatRatePercent,
  };
}

/**
 * **Le taux qu'on facturera pour cet article**, ou `null` s'il n'y en a pas.
 *
 * L'article, et lui seul.
 *
 * 🔴 **Le repli sur la famille a été retiré le 2026-09-06**, et sa propre note
 * annonçait ce retrait : « à retirer une fois que tous les articles ont reçu
 * leur taux (un push suffit) ». Le push existe depuis le 2026-08-31 et le seed
 * le rejoue.
 *
 * L'héritage n'est pas perdu pour autant, et c'est le point : **il a lieu dans
 * le PIM**, à la projection (`effectiveVat(famille, produit)`), une fois par
 * push, tracé, et corrigeable à l'écran. Ce repli-ci en était un SECOND, joué à
 * chaque facturation, contre la copie miroir de la famille, sans trace et sans
 * qu'aucun écran ne puisse le dire. Deux héritages pour une question, dont un
 * muet.
 *
 * Ce qu'il facturait vraiment : un article dont la ligne du miroir date d'avant
 * que le taux descende sur les articles. La projection l'écarte aujourd'hui
 * (`variant_sans_taux`) — mais un article écarté n'est pas RETIRÉ du miroir, sa
 * ligne d'avant reste en vente. C'est ce chemin-là qui est refermé.
 */
function billableRate(row: ItemRow): number | null {
  return row.vatRatePercent?.toNumber() ?? null;
}

/**
 * La règle de résolution, en une ligne : **la décision locale gagne quand elle
 * existe**, sinon c'est le prix du PIM. Le taux est passé **déjà vérifié non
 * nul** : un article sans TVA n'arrive jamais ici, il a été écarté avant.
 *
 * Les deux sont rendus. Un écran qui ne verrait que le prix final ne pourrait
 * pas dire « prix PIM 2,40 € · prix B2B 2,10 € », et un prix sans provenance ne
 * se défend pas devant un client qui le conteste.
 */
function resolve(row: ItemRow, served: ServedPrice, lineage: Lineage): ResolvedCatalogItem {
  return {
    sku: row.sku,
    productSku: row.productSku,
    name: row.name,
    unitPriceMillicents: served.unitPriceMillicents,
    pimPriceMillicents: served.pimPriceMillicents,
    vatRate: served.vatRate,
    categoryId: row.category.id,
    categoryName: row.category.name,
    family: {
      id: row.category.id,
      name: row.category.name,
      position: row.category.position,
      slug: row.category.slug,
      path: lineage(row.category.id),
    },
    isDefault: row.isDefault,
    isFeatured: row.override?.isFeatured ?? false,
    allergens: frozenAllergens(row),
    orderTimeLimit: orderTimeLimitOf(row),
    note: row.note,
    image: imageOf(row),
    thumbnail: thumbnailOf(row),
  };
}

/**
 * Le packshot, ou `null`.
 *
 * L'URL commande : sans elle il n'y a rien à afficher, et les trois autres
 * colonnes ne décrivent plus rien. Les dimensions, elles, restent légitimement
 * nulles — « pas mesuré » est un état, pas un trou.
 */
function imageOf(row: ItemRow): ResolvedCatalogItem["image"] {
  if (row.imageUrl === null) {
    return null;
  }
  return {
    url: row.imageUrl,
    alt: row.imageAlt ?? "",
    width: row.imageWidth,
    height: row.imageHeight,
  };
}

/**
 * La vignette de rayon, ou `null`.
 *
 * Même mécanique et même raison que le packshot — l'URL commande. `null` est
 * le cas COURANT tant qu'un push v10 n'a pas tourné : la vignette ne
 * traversait pas avant, et la vitrine retombe alors sur le packshot, ce
 * qu'elle a toujours fait.
 */
function thumbnailOf(row: ItemRow): ResolvedCatalogItem["thumbnail"] {
  if (row.thumbnailUrl === null) {
    return null;
  }
  return {
    url: row.thumbnailUrl,
    alt: row.thumbnailAlt ?? "",
    width: row.thumbnailWidth,
    height: row.thumbnailHeight,
  };
}

/**
 * Les trois colonnes de limite ↔ un objet, ou `null`.
 *
 * **Tout ou rien** : il suffit qu'une des trois manque pour qu'il n'y ait pas de
 * limite. Une limite sans heure ne se compare à rien, et recoller un objet
 * partiel donnerait au checkout une règle qu'il croirait pouvoir appliquer.
 */
function orderTimeLimitOf(row: ItemRow): ResolvedCatalogItem["orderTimeLimit"] {
  const { orderLimitDaysBefore, orderLimitTime, orderLimitGraceMinutes } = row;
  if (orderLimitDaysBefore === null || orderLimitTime === null || orderLimitGraceMinutes === null) {
    return null;
  }
  return {
    daysBefore: orderLimitDaysBefore,
    time: orderLimitTime,
    graceMinutes: orderLimitGraceMinutes,
  };
}

/**
 * Les allergènes tels qu'ils seront **figés sur la ligne de commande**.
 *
 * ⚠️ Rien n'est fabriqué ici. Un article sans déclaration rend `null`, et
 * jamais `{ codes: [] }` : la seconde forme affirmerait « aucun allergène » sur
 * une fiche qui n'en porte pas encore, et cette affirmation-là finirait figée
 * dans une commande — donc irrattrapable.
 */
function frozenAllergens(row: ItemRow): OrderLineAllergens | null {
  const codes = Array.isArray(row.allergens)
    ? row.allergens.filter((code): code is string => typeof code === "string")
    : null;
  const labelsRaw =
    typeof row.allergenLabels === "object" && row.allergenLabels !== null
      ? (row.allergenLabels as { labels?: unknown; incomplete?: unknown })
      : null;
  const labels = Array.isArray(labelsRaw?.labels)
    ? labelsRaw.labels.flatMap((entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { category?: unknown }).category === "string" &&
        typeof (entry as { label?: unknown }).label === "string"
          ? [
              {
                category: (entry as { category: string }).category,
                label: (entry as { label: string }).label,
              },
            ]
          : [],
      )
    : null;

  // Ni codes ni mentions : l'article est antérieur au fil qui les transporte.
  // C'est une ABSENCE, et elle se propage telle quelle.
  if (codes === null && labels === null) {
    return null;
  }
  return { codes, labels, incomplete: labelsRaw?.incomplete === true };
}

/**
 * **Les SKU en vente réservés aux opérations datées** (D3) — la moitié
 * « articles » de `CatalogOperationsReader`.
 *
 * Ici plutôt que dans l'adaptateur des opérations, et c'est la porte qui le
 * veut : `lint:withdrawn-filter` n'admet la lecture de `catalogItem` que dans
 * les lecteurs qui portent le filtre du retrait. Un article retiré n'est pas en
 * vente — qu'il soit exclusif ou non ne dit plus rien.
 */
export async function operationOnlySkusOf(prisma: PrismaService): Promise<ReadonlySet<string>> {
  const rows = await prisma.catalogItem.findMany({
    where: { ...STILL_SOLD, operationOnly: true },
    select: { sku: true },
  });
  return new Set(rows.map((row) => row.sku));
}
