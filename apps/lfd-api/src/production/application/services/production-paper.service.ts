import { Buffer } from "node:buffer";

import type { CatalogFamilyView } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { BrandLogoSource } from "../../../platform/brand/brand-logo.source.js";
import { AppConfig } from "../../../platform/config/app-config.js";
import { DocumentStorageUnavailableError } from "../../../platform/shared/errors/storage-errors.js";
import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import { OrderPrintColorsReader } from "../../channels/commerce/order-print-colors.reader.js";
import {
  type DeliveryNoteDrawing,
  PlannedDeliveryNotesReader,
} from "../../channels/commerce/planned-delivery-notes.reader.js";
import { ResupplyPrintColorsReader } from "../../channels/commerce/resupply-print-colors.reader.js";
import { WorkshopShelvesReader } from "../../channels/commerce/workshop-shelves.reader.js";
import type {
  ProductionDay,
  ProductionLineSnapshot,
  ProductionOrderSnapshot,
} from "../../domain/entities/production-day.js";
import { ProductionDayNotClosedError } from "../../domain/errors/production-errors.js";
import {
  atelierSheetPdfKey,
  productionCountPdfKey,
  renderAtelierSheetPdf,
  renderProductionCountPdf,
} from "../../domain/services/atelier-sheet-pdf.js";
import { countColorSharesOf } from "../../domain/services/count-color-shares.js";
import { dayDossierOf } from "../../domain/services/day-dossier.js";
import { dayDossierPdfKey, renderDayDossierPdf } from "../../domain/services/day-dossier-pdf.js";

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
  private readonly logger = new Logger(ProductionPapers.name);

  constructor(
    private readonly documents: ProductionDocumentStore,
    private readonly config: AppConfig,
    private readonly shelves: WorkshopShelvesReader,
    private readonly colors: OrderPrintColorsReader,
    private readonly resupplyColors: ResupplyPrintColorsReader,
    private readonly logo: BrandLogoSource,
    private readonly deliveryNotes: PlannedDeliveryNotesReader,
  ) {}

  /**
   * La feuille d'une commande, avec son QR de colisage et la pastille de sa
   * couleur, lue au tirage (§0 bis du plan de la planche des documents v2).
   */
  async sheetOf(
    order: ProductionOrderSnapshot,
    serviceDay: string,
    closedAt: Date,
  ): Promise<ProductionPaper> {
    return this.storedOr(
      atelierSheetPdfKey(order.orderId),
      `fiche-atelier-${order.reference}.pdf`,
      async () => {
        const [colors, logo] = await Promise.all([
          this.colors.colorsOf([order.orderId]),
          this.logo.load(),
        ]);
        return renderAtelierSheetPdf(
          order,
          { serviceDay, closedAt, logo },
          this.colisageUrl(order.reference),
          colors.get(order.orderId) ?? null,
        );
      },
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
      async () => {
        const resupplies = snapshot.resupplies ?? [];
        const [colors, resupplyColors, logo] = await Promise.all([
          this.colors.colorsOf(snapshot.orders.map((order) => order.orderId)),
          this.resupplyColors.colorsOf([...new Set(resupplies.map((resupply) => resupply.siteId))]),
          this.logo.load(),
        ]);
        return renderProductionCountPdf(
          snapshot.counts,
          { serviceDay: snapshot.serviceDay, closedAt, logo },
          countColorSharesOf(snapshot.orders, resupplies, colors, resupplyColors),
        );
      },
    );
  }

  /**
   * **Le dossier du jour** — récapitulatif par rayon (réassorts compris), puis
   * un bon par commande suivi de son BL de transport, et un bon par réassort,
   * lus dans ce que la journée a figé (les BL, eux, au tirage).
   *
   * Archivé **par tirage arrêté** : la clé porte l'instant du dernier retirage
   * (`dayDossierPdfKey`), si bien qu'un retirage fabrique un dossier complété
   * sans écraser celui qui était parti avant.
   *
   * ⚠️ Les rayons viennent du catalogue d'AUJOURD'HUI (comme l'écran) et sont
   * figés au premier tirage. Un commerce muet ne bloque pas le papier — tout va
   * en « Rayon inconnu » —, mais ce dossier dégradé n'est **pas archivé** : le
   * tirage suivant le refera avec ses rayons.
   *
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   */
  async dossierOf(day: ProductionDay): Promise<ProductionPaper> {
    const snapshot = day.toSnapshot();
    const closedAt = snapshot.closedAt;
    if (closedAt === null) {
      throw new ProductionDayNotClosedError(snapshot.serviceDay);
    }
    const retakenAt = snapshot.retaken?.at ?? null;
    const key = dayDossierPdfKey(snapshot.serviceDay, retakenAt);
    const fileName = `dossier-du-jour-${snapshot.serviceDay}.pdf`;
    const archived = await this.readArchived(key);
    if (archived !== null) {
      return { bytes: archived, fileName };
    }
    const resupplies = snapshot.resupplies ?? [];
    const shelves = await this.shelvesOrNull(snapshot.serviceDay, [
      ...snapshot.orders.flatMap((order) => order.lines),
      ...resupplies.flatMap((resupply) => resupply.lines),
    ]);
    const orderIds = snapshot.orders.map((order) => order.orderId);
    const [colors, resupplyColors, logo, deliveryNotes] = await Promise.all([
      this.colors.colorsOf(orderIds),
      this.resupplyColors.colorsOf([...new Set(resupplies.map((resupply) => resupply.siteId))]),
      this.logo.load(),
      this.deliveryNotesOrNull(snapshot.serviceDay, orderIds),
    ]);
    const bytes = await renderDayDossierPdf(
      dayDossierOf(snapshot.orders, shelves, resupplies),
      {
        serviceDay: snapshot.serviceDay,
        closedAt,
        closedBy: snapshot.closedBy,
        retakenAt,
        retakenByName: snapshot.retakenByName,
      },
      {
        logo,
        colisageUrlOf: (reference) => this.colisageUrl(reference),
        colors,
        resupplyColors,
        deliveryNotes: deliveryNotes ?? new Map(),
      },
    );
    if (shelves !== null && deliveryNotes !== null) {
      await this.archive(key, bytes);
    }
    return { bytes, fileName };
  }

  /**
   * Les rayons des SKU du jour — commandes ET réassorts, qui vont sur les mêmes
   * fiches de poste (R3d-bis) —, ou `null` : panne journalisée, jamais tue.
   */
  private async shelvesOrNull(
    serviceDay: string,
    lines: readonly ProductionLineSnapshot[],
  ): Promise<ReadonlyMap<string, CatalogFamilyView> | null> {
    const skus = [...new Set(lines.map((line) => line.sku))];
    try {
      return await this.shelves.shelvesOf(skus);
    } catch (error) {
      this.logger.error(
        `Dossier du ${serviceDay} : rayons illisibles, tiré en « Rayon inconnu » et non archivé.`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /**
   * Les BL de transport des commandes du jour, ou `null` : panne journalisée,
   * jamais tue. Le dossier part alors sans BL, et n'est **pas archivé** — le
   * tirage suivant le refera avec eux, comme pour les rayons.
   */
  private async deliveryNotesOrNull(
    serviceDay: string,
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, DeliveryNoteDrawing> | null> {
    try {
      return await this.deliveryNotes.drawingsOf(orderIds);
    } catch (error) {
      this.logger.error(
        `Dossier du ${serviceDay} : bons de livraison illisibles, tiré sans eux et non archivé.`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
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
