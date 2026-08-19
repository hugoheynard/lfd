import { Injectable } from "@nestjs/common";
import type {
  ReconciliationBoardView,
  ReconciliationDetailView,
  ReconciliationRowView,
  ReconciliationStatus,
} from "@lfd/pim-contracts";

import { CatalogueReader } from "../../../catalogue/domain/ports/catalogue-reader.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { ShopifyInspectionService } from "./inspection.service.js";
import { fingerprint, projectProduct, type ShopifyProductPayload } from "./projection.js";
import {
  comparableFromPayload,
  comparableFromRemote,
  comparableHash,
  diffComparable,
  statusFor,
  type Comparable,
  type RemoteVerdict,
} from "./reconciliation.js";
import { readPayloadColumn } from "./snapshot-payload.js";

interface OursEntry {
  readonly productId: string;
  readonly payload: ShopifyProductPayload;
}
interface BaseEntry {
  readonly fullHash: string;
  readonly payload: ShopifyProductPayload;
}

/** Priorité d'affichage : ce qui demande une action en haut, « à jour » en bas. */
const STATUS_ORDER: Record<ReconciliationStatus, number> = {
  conflict: 0,
  remote_drift: 1,
  to_remove: 2,
  local_ahead: 3,
  never_published: 4,
  unknown: 5,
  up_to_date: 6,
};

/**
 * Réconciliation à trois voies — **read model** : compose le catalogue courant (OURS),
 * les snapshots head (BASE) et l'état boutique (THEIRS) pour dire, par handle, ce qui a
 * bougé et de quel côté. N'écrit rien. La logique de décision est pure
 * ({@link reconciliation.ts}) ; ici on ne fait que rassembler les trois sources.
 */
@Injectable()
export class ShopifyReconciliationService {
  constructor(
    private readonly catalogue: CatalogueReader,
    private readonly prisma: PimPrismaService,
    private readonly inspection: ShopifyInspectionService,
  ) {}

  async board(): Promise<ReconciliationBoardView> {
    const ours = await this.loadOurs();
    const base = await this.loadBase();
    const { mode, theirs } = await this.loadRemote();
    const remoteKnown = mode === "live";

    const handles = new Set([...ours.keys(), ...base.keys(), ...theirs.keys()]);
    const rows = [...handles]
      .map((handle) => this.row(handle, ours, base, theirs, remoteKnown))
      .sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.handle.localeCompare(b.handle),
      );
    return { mode, rows };
  }

  async detail(handle: string): Promise<ReconciliationDetailView> {
    const ours = await this.loadOurs();
    const base = await this.loadBase();
    const { mode, theirs } = await this.loadRemote();

    const o = ours.get(handle);
    const b = base.get(handle);
    const t = theirs.get(handle) ?? null;
    const oComparable = o ? comparableFromPayload(o.payload) : null;
    const bComparable = b ? comparableFromPayload(b.payload) : null;

    const localAhead = this.localAhead(o, b);
    const remote = this.remoteVerdict(b, t, mode === "live");
    return {
      handle,
      status: statusFor({
        hasOurs: o !== undefined,
        hasBase: b !== undefined,
        localAhead,
        remote,
      }),
      base: bComparable,
      ours: oComparable,
      theirs: t,
      oursVsBase: oComparable && bComparable ? diffComparable(bComparable, oComparable) : [],
      theirsVsBase: bComparable && t ? diffComparable(bComparable, t) : [],
    };
  }

  private row(
    handle: string,
    ours: Map<string, OursEntry>,
    base: Map<string, BaseEntry>,
    theirs: Map<string, Comparable>,
    remoteKnown: boolean,
  ): ReconciliationRowView {
    const o = ours.get(handle);
    const b = base.get(handle);
    const localAhead = this.localAhead(o, b);
    const remote = this.remoteVerdict(b, theirs.get(handle) ?? null, remoteKnown);
    const status = statusFor({
      hasOurs: o !== undefined,
      hasBase: b !== undefined,
      localAhead,
      remote,
    });
    const diffCount =
      o && b
        ? diffComparable(comparableFromPayload(b.payload), comparableFromPayload(o.payload)).length
        : 0;
    return {
      handle,
      productId: o?.productId ?? null,
      status,
      diffCount,
      remoteDrift: status === "remote_drift" || status === "conflict",
    };
  }

  /** OURS a-t-il avancé depuis BASE ? Empreinte **pleine** (options comprises). */
  private localAhead(o: OursEntry | undefined, b: BaseEntry | undefined): boolean {
    return o !== undefined && b !== undefined && fingerprint(o.payload) !== b.fullHash;
  }

  /** État distant vu du BASE — un handle disparu de la boutique compte comme dérive. */
  private remoteVerdict(
    b: BaseEntry | undefined,
    t: Comparable | null,
    remoteKnown: boolean,
  ): RemoteVerdict {
    if (!remoteKnown) {
      return "unknown";
    }
    if (b === undefined) {
      return "aligned";
    }
    if (t === null) {
      return "drift";
    }
    return comparableHash(t) === comparableHash(comparableFromPayload(b.payload))
      ? "aligned"
      : "drift";
  }

  private async loadOurs(): Promise<Map<string, OursEntry>> {
    const products = await this.catalogue.publishable();
    const map = new Map<string, OursEntry>();
    for (const product of products) {
      const payload = projectProduct(product);
      map.set(payload.handle, { productId: product.id, payload });
    }
    return map;
  }

  private async loadBase(): Promise<Map<string, BaseEntry>> {
    const bindings = await this.prisma.shopifyProductBinding.findMany({
      where: { headSnapshotId: { not: null } },
      select: { headSnapshotId: true },
    });
    const ids = bindings
      .map((binding) => binding.headSnapshotId)
      .filter((id): id is string => id !== null);
    const map = new Map<string, BaseEntry>();
    if (ids.length === 0) {
      return map;
    }
    const snapshots = await this.prisma.shopifyPushSnapshot.findMany({
      where: { id: { in: ids } },
      select: { handle: true, hash: true, payload: true },
    });
    for (const snapshot of snapshots) {
      map.set(snapshot.handle, {
        fullHash: snapshot.hash,
        payload: readPayloadColumn(snapshot.payload),
      });
    }
    return map;
  }

  private async loadRemote(): Promise<{
    mode: "live" | "dry-run";
    theirs: Map<string, Comparable>;
  }> {
    const inspection = await this.inspection.inspect();
    const theirs = new Map<string, Comparable>();
    for (const product of inspection.products) {
      theirs.set(product.handle, comparableFromRemote(product));
    }
    return { mode: inspection.mode, theirs };
  }
}
