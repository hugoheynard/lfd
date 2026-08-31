import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import type { CatalogIngestionReport } from "@lfd/catalog-sync";

import { currentRequestContext } from "../../../../platform/context/request-context.store.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CatalogRevisionRepository } from "../../../catalogue/revision/domain/ports/catalog-revision.repository.js";
import {
  TakeCatalogRevisionCommand,
  type TakenRevision,
} from "../../../catalogue/revision/application/take-catalog-revision.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { B2bCatalogDriver, DryRunB2bCatalogDriver } from "./driver.js";
import { B2bCatalogFeedPreview } from "./feed-preview.js";
import type { Exclusion } from "./projection.js";

/** La destination, nommée une fois : elle désigne une ligne de publication. */
const B2B_CHANNEL = "b2b";

/** Ce que le push a produit, dit en entier — y compris ce qui n'est pas parti. */
export interface B2bPushSummary {
  readonly mode: "dry-run" | "live";
  /** Produits publiés sur le canal au moment du push. */
  readonly candidates: number;
  readonly report: CatalogIngestionReport | null;
  /** Ce qui a été écarté, avec son motif. Vide est une bonne nouvelle, pas un défaut. */
  readonly excluded: readonly Exclusion[];
}

@Injectable()
export class B2bCatalogPushService {
  constructor(
    private readonly feed: B2bCatalogFeedPreview,
    private readonly dryRun: DryRunB2bCatalogDriver,
    private readonly live: B2bCatalogDriver,
    private readonly prisma: PimPrismaService,
    private readonly commands: CommandBus,
    private readonly revisions: CatalogRevisionRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Projette le catalogue publié et l'envoie — ou le simule.
   *
   * L'instant d'émission est pris **une seule fois** et traverse la projection :
   * deux `new Date()` dans la même opération dériveraient de quelques
   * millisecondes, et le snapshot porterait un instant qui n'est celui de rien.
   *
   * Rien n'est estampillé tant que la plateforme n'a pas répondu. Poser
   * `lastPushedAt` avant la réponse ferait passer un échec réseau pour un
   * catalogue en ligne — l'écran dirait « à jour » d'un produit que personne ne
   * peut acheter.
   */
  async push(dryRunRequested: boolean): Promise<B2bPushSummary> {
    const driver: B2bCatalogDriver = dryRunRequested ? this.dryRun : this.live;
    const { snapshot, candidates, excluded } = await this.feed.preview(new Date().toISOString());

    if (candidates === 0) {
      return {
        mode: driver.mode,
        candidates: 0,
        report: null,
        excluded: [],
      };
    }

    // **On fige AVANT d'envoyer.** Une révision est ce qu'on s'apprête à
    // publier, pas une photographie prise après coup : figer ensuite
    // enregistrerait un catalogue qui a pu bouger entre l'envoi et la réponse,
    // et l'ancre ne dirait plus ce qui est parti.
    //
    // Sur un catalogue inchangé, aucune ancre n'est créée — la commande rend
    // celle qui existait, et la publication s'inscrit dessus. Deux envois du
    // même catalogue sont donc deux publications d'UNE révision, ce qui est
    // exactement ce qu'ils sont.
    const revision = await this.commands.execute<TakeCatalogRevisionCommand, TakenRevision>(
      new TakeCatalogRevisionCommand(null),
    );

    const report = await driver.send(snapshot).catch(async (error: unknown) => {
      // L'échec s'inscrit AUSSI. Une trace qui n'existe qu'en cas de succès ne
      // raconte que les bons jours, et c'est le mauvais jour qu'on vient
      // relire.
      await this.recordPublication(revision.id, driver.mode, "failed", null);
      throw error;
    });

    if (driver.mode === "live") {
      await this.stamp(snapshot.products.map((product) => product.id));
    }
    await this.recordPublication(revision.id, driver.mode, "sent", report);

    return {
      mode: driver.mode,
      candidates,
      report,
      excluded,
    };
  }

  /** Où cette révision est partie, et ce que la destination en a dit. */
  private async recordPublication(
    revisionId: string,
    mode: string,
    outcome: string,
    report: unknown,
  ): Promise<void> {
    await this.revisions.recordPublication({
      revisionId,
      channel: B2B_CHANNEL,
      mode,
      outcome,
      report,
      publishedAt: new Date(this.clock.now()),
      publishedBy: currentRequestContext()?.actor.id ?? null,
    });
  }

  /**
   * Estampille les produits **réellement partis**, pas les candidats.
   *
   * Un produit écarté par la projection (sans prix, famille sans TVA) reste sans
   * `lastPushedAt` : c'est ce qui permet à l'écran de le montrer comme en
   * attente au lieu de le déclarer à jour.
   */
  private async stamp(productIds: readonly string[]): Promise<void> {
    if (productIds.length === 0) {
      return;
    }
    await this.prisma.b2bChannelBinding.updateMany({
      where: { productId: { in: [...productIds] } },
      data: { lastPushedAt: new Date() },
    });
  }
}
