import { Injectable } from '@nestjs/common';
import type { CatalogIngestionReport } from '@lfd/catalog-sync';

import { CatalogueReader } from '../../../catalogue/domain/ports/catalogue-reader.js';
import { PrismaService } from '../../../infra/database/prisma.service.js';
import { B2bMembershipService } from '../membership/membership.service.js';
import {
  DryRunB2bCatalogDriver,
  LiveB2bCatalogDriver,
  type B2bCatalogDriver,
} from './driver.js';
import { projectCatalog, type Exclusion } from './projection.js';

/** Ce que le push a produit, dit en entier — y compris ce qui n'est pas parti. */
export interface B2bPushSummary {
  readonly mode: 'dry-run' | 'live';
  /** Produits publiés sur le canal au moment du push. */
  readonly candidates: number;
  readonly report: CatalogIngestionReport | null;
  /** Ce qui a été écarté, avec son motif. Vide est une bonne nouvelle, pas un défaut. */
  readonly excluded: readonly Exclusion[];
}

@Injectable()
export class B2bCatalogPushService {
  constructor(
    private readonly catalogue: CatalogueReader,
    private readonly membership: B2bMembershipService,
    private readonly dryRun: DryRunB2bCatalogDriver,
    private readonly live: LiveB2bCatalogDriver,
    private readonly prisma: PrismaService,
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
    const productIds = await this.membership.publishedProductIds();

    if (productIds.length === 0) {
      return {
        mode: driver.mode,
        candidates: 0,
        report: null,
        excluded: [],
      };
    }

    const [products, categories] = await Promise.all([
      this.catalogue.byIds(productIds),
      this.catalogue.channelCategories(),
    ]);

    const { snapshot, excluded } = projectCatalog(
      products,
      categories,
      new Date().toISOString(),
    );
    const report = await driver.send(snapshot);

    if (driver.mode === 'live') {
      await this.stamp(snapshot.products.map((product) => product.id));
    }

    return {
      mode: driver.mode,
      candidates: productIds.length,
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
