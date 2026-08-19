import { Injectable } from "@nestjs/common";
import type { CatalogIngestionReport } from "@lfd/catalog-sync";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { B2bCatalogDriver, DryRunB2bCatalogDriver } from "./driver.js";
import { B2bCatalogFeedPreview } from "./feed-preview.js";
import type { Exclusion } from "./projection.js";

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

    const report = await driver.send(snapshot);

    if (driver.mode === "live") {
      await this.stamp(snapshot.products.map((product) => product.id));
    }

    return {
      mode: driver.mode,
      candidates,
      report,
      excluded,
    };
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
