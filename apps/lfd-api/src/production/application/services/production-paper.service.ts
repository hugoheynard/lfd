import { Buffer } from "node:buffer";

import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { DocumentStorageUnavailableError } from "../../../platform/shared/errors/storage-errors.js";
import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import type {
  ProductionDay,
  ProductionOrderSnapshot,
} from "../../domain/entities/production-day.js";
import { ProductionDayNotClosedError } from "../../domain/errors/production-errors.js";
import {
  atelierSheetPdfKey,
  productionCountPdfKey,
  renderAtelierSheetPdf,
  renderProductionCountPdf,
} from "../../domain/services/atelier-sheet-pdf.js";

/** Un papier servi : ses octets et le nom proposé au téléchargement. */
export interface ProductionPaper {
  readonly bytes: Buffer;
  readonly fileName: string;
}

/**
 * **Les papiers du fournil : les relire s'ils existent, les fabriquer sinon.**
 *
 * Au pluriel : un `ProductionPaper` est UNE pièce, ce service les sert toutes.
 *
 * ## Pourquoi on les archive
 *
 * Parce que **tout le papier doit exister**. Une feuille partie au fournil et un
 * compte à produire affiché au mur sont des faits ; les refaire plus tard
 * donnerait d'autres documents, et c'est précisément quand on cherche ce qui
 * s'est passé qu'on en a besoin.
 *
 * Le compte à produire est le cas extrême : c'est un **instantané arrêté à la
 * clôture**, et les commandes bougent après. Il ne se refabrique pas depuis
 * l'état d'aujourd'hui — seulement depuis ce que la journée a figé, ce que
 * l'agrégat garantit en refusant de se rouvrir.
 *
 * ## Écrits au premier tirage, comme le bon de commande
 *
 * Même mécanisme, même raison : la plupart des journées ne verront jamais leur
 * PDF demandé, et le rendu est **déterministe** — deux tirages simultanés
 * écrivent les mêmes octets sous la même clé, le second écrase le premier par un
 * objet identique. Ni verrou, ni réservation.
 *
 * Le rangement est **best-effort** : un R2 en panne ne doit pas empêcher le
 * fournil d'imprimer. On rend les octets qu'on vient de fabriquer, et le
 * rangement retentera au tirage suivant.
 */
@Injectable()
export class ProductionPapers {
  constructor(
    private readonly documents: ProductionDocumentStore,
    private readonly config: AppConfig,
  ) {}

  /** La feuille d'une commande, avec son QR de colisage. */
  async sheetOf(
    order: ProductionOrderSnapshot,
    serviceDay: string,
    closedAt: Date,
  ): Promise<ProductionPaper> {
    return this.storedOr(
      atelierSheetPdfKey(order.orderId),
      `fiche-atelier-${order.reference}.pdf`,
      () => renderAtelierSheetPdf(order, serviceDay, closedAt, this.colisageUrl(order.reference)),
    );
  }

  /**
   * Le compte à produire d'une journée.
   *
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   */
  async countOf(day: ProductionDay): Promise<ProductionPaper> {
    const snapshot = day.toSnapshot();
    const closedAt = snapshot.closedAt;
    if (closedAt === null) {
      throw new ProductionDayNotClosedError(snapshot.serviceDay);
    }
    return this.storedOr(
      productionCountPdfKey(snapshot.serviceDay),
      `compte-a-produire-${snapshot.serviceDay}.pdf`,
      () => renderProductionCountPdf(snapshot.counts, snapshot.serviceDay, closedAt),
    );
  }

  /**
   * L'URL que le QR encode, ou une chaîne vide.
   *
   * Vide ⇒ **aucun code n'est imprimé**, plutôt qu'un carré qui ne mènerait
   * nulle part une fois scanné devant un four. Même conduite que l'écran du QR
   * client quand l'origine admin n'est pas configurée.
   */
  private colisageUrl(reference: string): string {
    const base = this.config.adminBaseUrl();
    return base === null ? "" : `${base}/colisage/${encodeURIComponent(reference)}`;
  }

  private async storedOr(
    key: string,
    fileName: string,
    make: () => Promise<Buffer>,
  ): Promise<ProductionPaper> {
    const archived = await this.readArchived(key);
    if (archived !== null) {
      return { bytes: archived, fileName };
    }
    const bytes = await make();
    await this.archive(key, bytes);
    return { bytes, fileName };
  }

  /** L'archive, ou `null` — y compris quand le stockage est en panne. */
  private async readArchived(key: string): Promise<Buffer | null> {
    try {
      return await this.documents.readIfPresent(key);
    } catch (error) {
      if (error instanceof DocumentStorageUnavailableError) {
        return null;
      }
      throw error;
    }
  }

  /** Le rangement ne fait pas échouer le tirage — cf. l'en-tête. */
  private async archive(key: string, bytes: Buffer): Promise<void> {
    try {
      await this.documents.save(key, { bytes, contentType: "application/pdf" });
    } catch {
      // Silence volontaire : l'adaptateur a journalisé, le fournil a son papier,
      // et le prochain tirage retentera.
    }
  }
}
