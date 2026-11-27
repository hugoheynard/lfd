import type { CommandBus } from "@nestjs/cqrs";

import { VariantCustomRecipeMarker } from "../../../pim/channels/b2b-platform/custom-recipe/variant-custom-recipe-marker.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PostDeployOperation,
  REPORT_SAMPLE_LIMIT,
  type OperationReport,
  type PostDeployApplication,
} from "../../../platform/post-deploy/post-deploy-operation.js";
import { ReleaseArticleCommand } from "../application/commands/release-article.command.js";

/** La clé stable de l'opération. */
export const CUSTOM_RECIPE_RECONCILIATION_KEY = "catalog.custom-recipe-reconciliation";

/** Un article ordinaire qui a encore des comptes attribués. */
export interface Candidate {
  readonly sku: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly withdrawn: boolean;
  readonly companyIds: readonly string[];
}

/**
 * **Les articles attribués passent sur mesure** (`documentation/catalogue/
 * plan-fin-du-sur-mesure.md`, D5).
 *
 * Seul le sur mesure s'attribue désormais. Une attribution posée sur un
 * article ordinaire est une décision humaine : on la garde, en passant
 * l'article sur mesure **au référentiel**, par son vrai geste. Le commerce
 * l'apprend par le fait de fiche, après relais.
 *
 * Un article RETIRÉ de la vente (fiche inactive, déclinaison arrêtée) n'est
 * plus réécrit par la fiche : le passer sur mesure au référentiel ne
 * changerait rien ici. Il n'est servi à personne ; ses attributions sont
 * retirées par le geste du commerce, journalisé, et la fiche le redira sur
 * mesure s'il revient. Un article sans déclinaison connue (ligne d'avant
 * l'identifiant) est laissé à la main.
 *
 * La clé `(sku, custom_recipe)` (lot F3) refuse de s'installer tant que la
 * simulation trouve un candidat : elle ne se déploie qu'après.
 */
export class CustomRecipeReconciliationOperation extends PostDeployOperation {
  readonly key = CUSTOM_RECIPE_RECONCILIATION_KEY;
  readonly title = "Passer sur mesure les articles attribués à des comptes clients";
  readonly why =
    "Seul un article sur mesure s'attribue désormais à des comptes clients. Des articles ordinaires en ont encore : ils restent cachés aux autres pros sans qu'aucun écran le dise. On garde la décision en les passant sur mesure au référentiel.";
  readonly limit =
    "Un article passé sur mesure ne se remet ouvert qu'à la main, sur sa fiche (« Désactiver sur mesure »), ce qui retire ses comptes attribués. Les attributions d'un article retiré de la vente sont supprimées : elles se reposent à la main.";
  readonly after: readonly string[] = [];

  constructor(
    private readonly articles: AttributedOrdinaryArticles,
    private readonly marker: VariantCustomRecipeMarker,
    private readonly commands: Pick<CommandBus, "execute">,
  ) {
    super();
  }

  async simulate(): Promise<OperationReport> {
    const candidates = await this.articles.list();
    const { onSale, withdrawn, byHand } = sorted(candidates);
    return {
      writable: onSale.length + withdrawn.length,
      byHand: byHand.length,
      summary: [
        `${onSale.length} article(s) en vente à passer sur mesure au référentiel.`,
        `${withdrawn.length} article(s) retiré(s) de la vente dont les attributions partent.`,
        `${byHand.length} article(s) sans déclinaison connue, à régler à la main.`,
      ],
      sample: sampleOf(candidates),
    };
  }

  async apply(run: PostDeployApplication): Promise<OperationReport> {
    const { onSale, withdrawn, byHand } = sorted(await this.articles.list());
    let written = 0;
    for (const candidate of onSale) {
      if (candidate.variantId === null) {
        continue;
      }
      await this.marker.markCustomRecipe({
        productId: candidate.productId,
        variantId: candidate.variantId,
      });
      written += 1;
      await run.progress(progressOf(written, byHand.length));
    }
    for (const candidate of withdrawn) {
      for (const companyId of candidate.companyIds) {
        await this.commands.execute<ReleaseArticleCommand, void>(
          new ReleaseArticleCommand(candidate.sku, companyId),
        );
      }
      written += 1;
      await run.progress(progressOf(written, byHand.length));
    }
    return {
      writable: written,
      byHand: byHand.length,
      summary: [
        `${onSale.length} article(s) passé(s) sur mesure au référentiel : le commerce le saura après relais.`,
        `${withdrawn.length} article(s) retiré(s) de la vente libéré(s) de leurs attributions.`,
        `${byHand.length} article(s) laissé(s) à la main.`,
      ],
      sample: sampleOf([...onSale, ...withdrawn, ...byHand]),
    };
  }
}

function sorted(candidates: readonly Candidate[]) {
  return {
    onSale: candidates.filter((c) => !c.withdrawn && c.variantId !== null),
    withdrawn: candidates.filter((c) => c.withdrawn),
    byHand: candidates.filter((c) => !c.withdrawn && c.variantId === null),
  };
}

function sampleOf(candidates: readonly Candidate[]): readonly string[] {
  return candidates
    .slice(0, REPORT_SAMPLE_LIMIT)
    .map((c) => `${c.sku} — ${c.companyIds.length} compte(s)${c.withdrawn ? ", retiré" : ""}`);
}

function progressOf(written: number, byHand: number): OperationReport {
  return { writable: written, byHand, summary: [`${written} article(s) traité(s).`], sample: [] };
}

/** Lecture seule : les articles ordinaires qui ont au moins une attribution. */
export abstract class AttributedOrdinaryArticles {
  abstract list(): Promise<readonly Candidate[]>;
}

/** La lecture, dans les tables du commerce. */
export class PrismaAttributedOrdinaryArticles extends AttributedOrdinaryArticles {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly Candidate[]> {
    // withdrawn-filter: exempt — les retirés sont lus EXPRÈS, pour retirer
    // leurs attributions ; rien n'est remis en vente.
    const rows = await this.prisma.catalogItem.findMany({
      where: { customRecipe: false, reservations: { some: {} } },
      select: {
        sku: true,
        productId: true,
        variantId: true,
        withdrawnAt: true,
        reservations: { select: { companyId: true }, orderBy: { companyId: "asc" } },
      },
      orderBy: { sku: "asc" },
    });
    return rows.map((row) => ({
      sku: row.sku,
      productId: row.productId,
      variantId: row.variantId,
      withdrawn: row.withdrawnAt !== null,
      companyIds: row.reservations.map((reservation) => reservation.companyId),
    }));
  }
}
