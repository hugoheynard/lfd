import { Injectable } from "@nestjs/common";
import type { B2bMembershipView } from "@lfd/pim-contracts";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";

/**
 * **L'appartenance au canal B2B** : qui est vendu aux pros, et depuis quand.
 *
 * Publier n'est pas pousser. Publier est une décision commerciale qui vit ici ;
 * pousser est l'acte technique qui la porte à la plateforme, et il peut échouer,
 * traîner, ou n'avoir jamais eu lieu. Les confondre donnerait un écran où « c'est
 * publié » signifierait à la fois « je l'ai décidé » et « c'est en ligne », deux
 * choses qui divergent précisément quand on a besoin de les distinguer.
 *
 * Dépublier **supprime la ligne** plutôt que de poser un drapeau : la décision
 * n'existe plus, et le prochain snapshot ne portera plus le produit — c'est le
 * rapport d'ingestion qui annoncera le retrait, là où quelqu'un le lira.
 */
@Injectable()
export class B2bMembershipService {
  constructor(private readonly prisma: PimPrismaService) {}

  /** Tous les produits du canal. Alimente la colonne « B2B » du tableau produits. */
  async list(): Promise<B2bMembershipView[]> {
    const rows = await this.prisma.b2bChannelBinding.findMany({
      orderBy: { publishedAt: "desc" },
    });
    return rows.map((row) => ({
      productId: row.productId,
      publishedAt: row.publishedAt.toISOString(),
      publishedBy: row.publishedBy,
      lastPushedAt: row.lastPushedAt?.toISOString() ?? null,
    }));
  }

  /** Les identifiants seuls — ce dont la projection a besoin, sans le reste. */
  async publishedProductIds(): Promise<string[]> {
    const rows = await this.prisma.b2bChannelBinding.findMany({
      select: { productId: true },
    });
    return rows.map((row) => row.productId);
  }

  /**
   * Met un produit en vente sur le canal.
   *
   * Idempotent : republier ne réécrit ni la date d'origine ni l'auteur — c'est
   * la **première** mise en vente qui répond à « depuis quand », et un double
   * clic ne doit pas effacer cette réponse.
   */
  async publish(productId: string, actor: string | null): Promise<void> {
    await this.prisma.b2bChannelBinding.upsert({
      where: { productId },
      create: { productId, publishedBy: actor },
      update: {},
    });
  }

  /** Retire un produit du canal. Silencieux s'il n'y était pas : le résultat voulu est le même. */
  async unpublish(productId: string): Promise<void> {
    await this.prisma.b2bChannelBinding.deleteMany({ where: { productId } });
  }

  /**
   * La même bascule, **en lot** — ouvrir un canal se fait une fois sur tout un
   * catalogue. Idempotent comme l'unitaire : les déjà-publiés gardent leur date.
   *
   * @returns le nombre de produits **effectivement** concernés, pour que
   *   l'appelant puisse dire « 93 publiés » plutôt que « c'est fait ».
   */
  async publishMany(productIds: readonly string[], actor: string | null): Promise<number> {
    for (const productId of productIds) {
      await this.publish(productId, actor);
    }
    return productIds.length;
  }

  /** Retire un lot du canal. */
  async unpublishMany(productIds: readonly string[]): Promise<number> {
    const removed = await this.prisma.b2bChannelBinding.deleteMany({
      where: { productId: { in: [...productIds] } },
    });
    return removed.count;
  }
}
