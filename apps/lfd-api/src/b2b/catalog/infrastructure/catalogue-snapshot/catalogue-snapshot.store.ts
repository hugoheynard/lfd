import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { currentRequestContext } from "../../../../platform/context/request-context.store.js";
import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { insideCatalogueSnapshot } from "../../application/catalogue-snapshot-scope.js";
import type { VersionedContext } from "../catalogue-snapshot-columns.js";
import {
  loadArticles,
  loadGeneralCutoff,
  loadOperations,
  readContextVersions,
  readReservations,
  type SnapshotArticles,
  type SnapshotGeneralCutoff,
  type SnapshotOperations,
} from "./catalogue-snapshot.loader.js";
import { VersionedChunkMemory } from "./versioned-chunk-memory.js";

/** Les réservations d'une requête, par SKU. */
export type RequestReservations = ReadonlyMap<string, readonly { readonly companyId: string }[]>;

/** Ce qu'une requête a lu une fois, et garde jusqu'à sa fin. */
interface PerRequest {
  versions: Promise<ReadonlyMap<string, bigint>> | null;
  readonly reservations: Map<string, Promise<RequestReservations>>;
}

/**
 * **L'instantané du catalogue, en mémoire de l'API**
 * (`documentation/caching-usage/plan-materiaux-du-catalogue.md`, § 2.3, lot M1b).
 *
 * Trois morceaux, chacun rangé sous le numéro de SON contexte dans
 * `context_versions` : `catalog` (articles, familles, dérogations, compteur
 * de réservations), `order_cutoffs` (l'heure limite générale) et, depuis le
 * lot M2, `operations` (les opérations non retirées et leurs articles), que
 * seul le rayon lit. Un morceau n'est chargé que si un chemin le demande.
 *
 * - les numéros se lisent **une fois par requête**, gardés sur le contexte de
 *   la requête comme l'estampille des prix (`PricingMaterialsCache`) ;
 * - les réservations de l'appelant se lisent **avant** les numéros, filtrées
 *   par ses sociétés en SQL, une fois par requête et par jeu de sociétés ;
 * - **hors requête** (cron, semis), hors de la portée
 *   (`withCatalogueSnapshot`) ou réglage `CATALOGUE_SNAPSHOT_MEMORY=off` :
 *   {@link serves} est faux et les adaptateurs lisent la base comme avant.
 */
@Injectable()
export class CatalogueSnapshotStore {
  private readonly articleMemory = new VersionedChunkMemory<SnapshotArticles>();
  private readonly cutoffMemory = new VersionedChunkMemory<SnapshotGeneralCutoff>();
  private readonly operationMemory = new VersionedChunkMemory<SnapshotOperations>();
  private readonly perRequest = new WeakMap<object, PerRequest>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** L'instantané sert-il cette lecture ? Sinon, l'adaptateur lit la base. */
  serves(): boolean {
    return (
      this.config.catalogueSnapshotMemory() &&
      insideCatalogueSnapshot() &&
      currentRequestContext() !== null
    );
  }

  /** Le morceau `catalog`, sous le numéro de la requête. */
  async articles(): Promise<SnapshotArticles> {
    const version = await this.versionOf("catalog");
    return this.articleMemory.of(version, () => loadArticles(this.prisma));
  }

  /** Le morceau `order_cutoffs`, sous le numéro de la requête. */
  async generalCutoff(): Promise<SnapshotGeneralCutoff> {
    const version = await this.versionOf("order_cutoffs");
    return this.cutoffMemory.of(version, () => loadGeneralCutoff(this.prisma));
  }

  /** Le morceau `operations` (lot M2), sous le numéro de la requête. */
  async operations(): Promise<SnapshotOperations> {
    const version = await this.versionOf("operations");
    return this.operationMemory.of(version, () => loadOperations(this.prisma));
  }

  /**
   * Les réservations de ces sociétés, lues une fois par requête.
   *
   * 🔴 À appeler AVANT {@link articles} (§ 9) : le compteur de l'instantané
   * est alors au moins aussi récent que la liste, et un écart entre les deux
   * ne peut que refuser à l'appelant son propre article le temps d'une
   * requête — jamais servir celui d'une autre société.
   */
  reservationsFor(holderIds: readonly string[]): Promise<RequestReservations> {
    if (holderIds.length === 0) {
      return Promise.resolve(new Map());
    }
    const state = this.state();
    const key = [...holderIds].sort().join(",");
    const held = state?.reservations.get(key);
    if (held !== undefined) {
      return held;
    }
    const reading = readReservations(this.prisma, holderIds);
    state?.reservations.set(key, reading);
    return reading;
  }

  /** Oublie les morceaux gardés — le `reset()` du harnais e2e, après la remise des numéros. */
  forget(): void {
    this.articleMemory.forget();
    this.cutoffMemory.forget();
    this.operationMemory.forget();
  }

  /** Le numéro d'un contexte pour cette requête, ou `null` si sa ligne manque. */
  private async versionOf(context: VersionedContext): Promise<bigint | null> {
    const versions = await this.versions();
    return versions.get(context) ?? null;
  }

  private versions(): Promise<ReadonlyMap<string, bigint>> {
    const state = this.state();
    if (state === null) {
      // Hors requête, `serves()` est faux : ce chemin ne garde rien.
      return readContextVersions(this.prisma);
    }
    state.versions ??= readContextVersions(this.prisma);
    return state.versions;
  }

  private state(): PerRequest | null {
    const request = currentRequestContext();
    if (request === null) {
      return null;
    }
    const known = this.perRequest.get(request);
    if (known !== undefined) {
      return known;
    }
    const fresh: PerRequest = { versions: null, reservations: new Map() };
    this.perRequest.set(request, fresh);
    return fresh;
  }
}
