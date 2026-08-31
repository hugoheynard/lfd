import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  pushPayloadSchema,
  rollbackPayloadSchema,
  type ProductBindingView,
  type PushPayload,
  type PushReport,
  type PushSummary,
  type ReconciliationBoardView,
  type ReconciliationDetailView,
  type RollbackPayload,
  type SnapshotView,
} from "@lfd/pim-contracts";

import { PublicationGesture } from "../../../publication/publication-switch.js";
import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { ShopifyInspectionService } from "./inspection.service.js";
import { ShopifyPushService } from "./push.service.js";
import { ShopifyReconciliationService } from "./reconciliation.service.js";
import { ShopifySnapshotService } from "./snapshot.service.js";

/**
 * Ressource **produits** : l'état de synchro (bindings) et le push (projection →
 * empreinte → binding, simulé tant que le driver est en dry-run). Sous-chemin
 * `products` sous le préfixe module `channels/shopify`.
 *
 * Surface staff murée par `@AdminSurface("catalog")` : identité vérifiée
 * contre l'annuaire, puis périmètre. Elle a été **ouverte** tant que le
 * référentiel vivait dans son propre processus — un jeton Auth0 valide
 * suffisait, et un révoqué gardait la main sur le catalogue.
 */
@AdminSurface("catalog")
@Controller("products")
export class ShopifyProductsController {
  constructor(
    private readonly pushService: ShopifyPushService,
    private readonly inspection: ShopifyInspectionService,
    private readonly snapshots: ShopifySnapshotService,
    private readonly reconciliation: ShopifyReconciliationService,
    private readonly prisma: PimPrismaService,
  ) {}

  /** L'état actuel du catalogue de la boutique — lecture seule (miroir distant). */
  @Get("inspection")
  inspect() {
    return this.inspection.inspect();
  }

  /** État de synchro par produit — alimente la colonne du tableau. */
  @Get("bindings")
  async listBindings(): Promise<ProductBindingView[]> {
    const rows = await this.prisma.shopifyProductBinding.findMany();
    return rows.map((row) => ({
      productId: row.productId,
      syncStatus: row.syncStatus,
      lastPushedAt: row.lastPushedAt?.toISOString() ?? null,
      lastError: row.lastError,
    }));
  }

  // Le catalogue part DEHORS : fermé quand la publication ne l'est pas.
  @PublicationGesture()
  @Post("push")
  push(@Body(new ZodBody(pushPayloadSchema)) body: PushPayload): Promise<PushSummary> {
    return this.pushService.push(body.productIds, body.dryRun ?? false);
  }

  /** Le tableau de réconciliation à trois voies — par handle, ce qui a bougé. */
  @Get("reconciliation")
  reconcile(): Promise<ReconciliationBoardView> {
    return this.reconciliation.board();
  }

  /** Détail d'un handle : BASE/OURS/THEIRS + diffs par paire. */
  @Get("reconciliation/:handle")
  reconcileOne(@Param("handle") handle: string): Promise<ReconciliationDetailView> {
    return this.reconciliation.detail(handle);
  }

  /** L'historique versionné d'un handle — la matière du retour arrière. */
  @Get("history/:handle")
  history(@Param("handle") handle: string): Promise<SnapshotView[]> {
    return this.snapshots.history(handle);
  }

  /** Rejoue une version antérieure : re-pousse son payload figé (crée une version). */
  // Un retour arrière re-pousse un payload figé : il publie, lui aussi.
  @PublicationGesture()
  @Post("rollback")
  rollback(@Body(new ZodBody(rollbackPayloadSchema)) body: RollbackPayload): Promise<PushReport> {
    return this.pushService.rollback(body.handle, body.version);
  }
}
