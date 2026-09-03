import type { B2bMembershipService } from "../../src/pim/channels/b2b-platform/membership/membership.service.js";
import type { PrismaService } from "../../src/platform/database/prisma.service.js";
import type { CatalogueCorpus, CorpusChannel, CorpusProduct } from "./corpus.js";

/**
 * Ouvre le canal **B2B** pour les fiches que la matrice y vend.
 *
 * ## Pourquoi cette phase existe alors qu'elle ne devrait pas
 *
 * « Vendu aux pros » est écrit à DEUX endroits. La matrice des contextes de
 * vente le dit — une case `(point de vente, b2b)` sur la fiche ou, à défaut, sur
 * sa famille. Et `pim.b2b_channel_binding` le redit, une ligne par produit,
 * posée par un bouton distinct. La projection du miroir consulte **les deux** :
 * la table décide qui est candidat (`publishedProductIds`), la matrice décide
 * qui est retenu.
 *
 * Deux sources pour une décision divergent, et celles-ci ont divergé : au
 * moment où ce seed a été écrit, la matrice vendait 41 fiches aux pros et la
 * table en portait 1. Un catalogue rejoué sans cette phase produit donc un PIM
 * juste et un miroir B2B vide — ce qui ressemble à une panne du canal alors que
 * c'est un désaccord entre deux tables.
 *
 * Le seed ne tranche pas le désaccord : il **aligne la copie sur l'original**.
 * La matrice fait foi, parce qu'elle est celle qui porte l'héritage de famille,
 * le point de vente et le journal. Le jour où la table disparaît (cf.
 * `documentation/pim/ecrans-du-cycle-catalogue.md`), ce fichier disparaît avec
 * elle, sans rien à démêler.
 *
 * ## Pourquoi un service, là où tout le reste passe par le bus
 *
 * Parce qu'il n'y a pas de commande. `MembershipController` injecte
 * `B2bMembershipService` en direct — l'une des violations recensées de la règle
 * « un contrôleur n'injecte QUE des bus ». Le seed emprunte donc la même porte
 * que l'écran, ce qui reste préférable à en ouvrir une seconde.
 */
const B2B_CONTEXT_KEY = "b2b";

/** L'auteur inscrit sur la ligne : reconnaissable dans la colonne « B2B ». */
const SEED_ACTOR = "seed-pim";

export interface B2bChannelReport {
  readonly sold: number;
  readonly opened: number;
}

export async function openB2bChannel(
  membership: B2bMembershipService,
  prisma: PrismaService,
  catalogue: CatalogueCorpus,
): Promise<B2bChannelReport> {
  const familyChannels = new Map(
    catalogue.categories.map((category) => [category.name.fr, category.channels] as const),
  );
  const skus = catalogue.products
    .filter((product) => sellsB2b(product, familyChannels))
    .map((product) => product.sku);

  // Le SKU est la clé portable ; l'identifiant, lui, a été frappé au rejeu.
  const rows = await prisma.product.findMany({
    where: { sku: { in: skus }, status: "published" },
    select: { id: true },
  });
  const opened = await membership.publishMany(
    rows.map((row) => row.id),
    SEED_ACTOR,
  );
  return { sold: skus.length, opened };
}

/**
 * La matrice EFFECTIVE : la dérogation de la fiche si elle en a une, sinon celle
 * de sa famille. `null` n'est pas « rien vendu » — c'est « suit sa famille », et
 * confondre les deux fermerait le canal de toutes les fiches qui n'ont jamais
 * dérogé, c'est-à-dire presque toutes.
 */
function sellsB2b(
  product: CorpusProduct,
  familyChannels: ReadonlyMap<string, readonly CorpusChannel[]>,
): boolean {
  const effective = product.channels ?? familyChannels.get(product.categoryName) ?? [];
  return effective.some((cell) => cell.context === B2B_CONTEXT_KEY);
}
