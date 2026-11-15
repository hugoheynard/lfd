import type { CatalogFamilyView } from "@lfd/contracts";
import { Inject, Injectable, Logger } from "@nestjs/common";

import { BrandLogoSource } from "../../../platform/brand/brand-logo.source.js";
import { AppConfig } from "../../../platform/config/app-config.js";
import { OrderPrintColorsReader } from "../../channels/commerce/order-print-colors.reader.js";
import {
  type DeliveryNoteDrawing,
  PlannedDeliveryNotesReader,
} from "../../channels/commerce/planned-delivery-notes.reader.js";
import { ResupplyPrintColorsReader } from "../../channels/commerce/resupply-print-colors.reader.js";
import { WorkshopShelvesReader } from "../../channels/commerce/workshop-shelves.reader.js";
import { ProductionDisplaySettings } from "../../domain/entities/production-display-settings.js";
import { ProductionDisplaySettingsReader } from "../../domain/ports/production-display-settings.reader.js";
import type {
  ProductionDay,
  ProductionDaySnapshot,
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
import {
  type CalendarPage,
  dossierCalendarOf,
} from "../../domain/services/day-dossier-calendar.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { WorksheetDeadlinesReading } from "./worksheet-deadlines-reading.service.js";
import { countPaperRowsOf } from "../../domain/services/made-to-order.js";
import { dayDossierPdfKey, renderDayDossierPdf } from "../../domain/services/day-dossier-pdf.js";
import type { PaperDraft, PaperSlot } from "./production-paper-archive.service.js";

type ClosedSnapshot = ProductionDaySnapshot & { readonly closedAt: Date };

/** Le cliché d'une journée arrêtée. @throws {ProductionDayNotClosedError} */
function closedSnapshotOf(day: ProductionDay): ClosedSnapshot {
  const snapshot = day.toSnapshot();
  const closedAt = snapshot.closedAt;
  if (closedAt === null) {
    throw new ProductionDayNotClosedError(snapshot.serviceDay);
  }
  return { ...snapshot, closedAt };
}

/** La place de la feuille d'atelier d'une commande. */
export function atelierSheetSlotOf(order: ProductionOrderSnapshot): PaperSlot {
  return {
    key: atelierSheetPdfKey(order.orderId),
    fileName: `fiche-atelier-${order.reference}.pdf`,
  };
}

/**
 * La place du compte à produire d'une journée.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 */
export function productionCountSlotOf(day: ProductionDay): PaperSlot {
  const { serviceDay } = closedSnapshotOf(day);
  return {
    key: productionCountPdfKey(serviceDay),
    fileName: `compte-a-produire-${serviceDay}.pdf`,
  };
}

/**
 * La place du dossier du jour : **par tirage arrêté**. La clé porte l'instant
 * du dernier retirage (`dayDossierPdfKey`), si bien qu'un retirage fabrique un
 * dossier complété sans écraser celui qui était parti avant.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 */
export function dayDossierSlotOf(day: ProductionDay): PaperSlot {
  const snapshot = closedSnapshotOf(day);
  return {
    key: dayDossierPdfKey(snapshot.serviceDay, snapshot.retaken?.at ?? null),
    fileName: `dossier-du-jour-${snapshot.serviceDay}.pdf`,
  };
}

/** Ce que le dossier lit au tirage, chaque lecture faillible à `null`. */
interface DossierInputs {
  readonly shelves: ReadonlyMap<string, CatalogFamilyView> | null;
  readonly colors: Awaited<ReturnType<OrderPrintColorsReader["colorsOf"]>>;
  readonly resupplyColors: Awaited<ReturnType<ResupplyPrintColorsReader["colorsOf"]>>;
  readonly logo: Awaited<ReturnType<BrandLogoSource["load"]>>;
  readonly deliveryNotes: ReadonlyMap<string, DeliveryNoteDrawing> | null;
  readonly showSubcategories: boolean;
  readonly tranches: Awaited<ReturnType<WorksheetDeadlinesReading["read"]>>;
}

/**
 * **Le rendu des papiers du fournil** : lire ce que chacun affiche et en
 * produire les octets. Il ne range rien — l'archive est à
 * `ProductionPaperArchive`, et chaque cas d'usage relie les deux.
 *
 * Le compte à produire est un **instantané arrêté à la clôture**, et les
 * commandes bougent après. Il ne se refabrique pas depuis l'état
 * d'aujourd'hui — seulement depuis ce que la journée a figé, ce que l'agrégat
 * garantit en refusant de se rouvrir.
 */
@Injectable()
export class ProductionPaperRenderer {
  private readonly logger = new Logger(ProductionPaperRenderer.name);

  constructor(
    private readonly config: AppConfig,
    private readonly shelves: WorkshopShelvesReader,
    private readonly colors: OrderPrintColorsReader,
    private readonly resupplyColors: ResupplyPrintColorsReader,
    private readonly logo: BrandLogoSource,
    private readonly deliveryNotes: PlannedDeliveryNotesReader,
    private readonly display: ProductionDisplaySettingsReader,
    // Le seul geste lu : `read`. Typé étroit pour qu'un test le double sans
    // la classe ; le jeton reste la classe, pour l'injection.
    @Inject(WorksheetDeadlinesReading)
    private readonly tranches: Pick<WorksheetDeadlinesReading, "read">,
  ) {}

  /**
   * La feuille d'une commande, avec son QR de colisage et la pastille de sa
   * couleur, lue au tirage. Toujours archivable.
   */
  async sheetOf(
    order: ProductionOrderSnapshot,
    serviceDay: string,
    closedAt: Date,
  ): Promise<PaperDraft> {
    const [colors, logo] = await Promise.all([
      this.colors.colorsOf([order.orderId]),
      this.logo.load(),
    ]);
    const bytes = await renderAtelierSheetPdf(
      order,
      { serviceDay, closedAt, logo },
      this.colisageUrl(order.reference),
      colors.get(order.orderId) ?? null,
    );
    return { bytes, archivable: true };
  }

  /**
   * Le compte à produire d'une journée. Toujours archivable.
   *
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   */
  async countOf(day: ProductionDay): Promise<PaperDraft> {
    const snapshot = closedSnapshotOf(day);
    const resupplies = snapshot.resupplies ?? [];
    const [colors, resupplyColors, logo] = await Promise.all([
      this.colors.colorsOf(snapshot.orders.map((order) => order.orderId)),
      this.resupplyColors.colorsOf([...new Set(resupplies.map((resupply) => resupply.siteId))]),
      this.logo.load(),
    ]);
    const bytes = await renderProductionCountPdf(
      countPaperRowsOf(snapshot.counts, snapshot.orders),
      { serviceDay: snapshot.serviceDay, closedAt: snapshot.closedAt, logo },
      countColorSharesOf(snapshot.orders, resupplies, colors, resupplyColors),
    );
    return { bytes, archivable: true };
  }

  /**
   * **Le dossier du jour** — récapitulatif par rayon (réassorts compris), puis
   * un bon par commande suivi de son BL de transport, et un bon par réassort,
   * lus dans ce que la journée a figé (les BL, eux, au tirage).
   *
   * ⚠️ Les rayons viennent du catalogue d'AUJOURD'HUI (comme l'écran) et sont
   * figés au premier tirage. Un commerce muet ne bloque pas le papier — tout va
   * en « Rayon inconnu » —, mais ce dossier dégradé n'est **pas archivable** :
   * le tirage suivant le refera avec ses rayons. Idem sans BL ni tranches.
   *
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   */
  async dossierOf(day: ProductionDay): Promise<PaperDraft> {
    const snapshot = closedSnapshotOf(day);
    const resupplies = snapshot.resupplies ?? [];
    const inputs = await this.dossierInputsOf(snapshot);
    const dossier = dayDossierOf(
      snapshot.orders,
      inputs.shelves,
      resupplies,
      inputs.showSubcategories,
    );
    const calendar: readonly CalendarPage[] =
      inputs.tranches === null ? [] : dossierCalendarOf(dossier.recap, inputs.tranches);
    const bytes = await renderDayDossierPdf(
      dossier,
      {
        serviceDay: snapshot.serviceDay,
        closedAt: snapshot.closedAt,
        closedBy: snapshot.closedBy,
        retakenAt: snapshot.retaken?.at ?? null,
        retakenByName: snapshot.retakenByName,
      },
      {
        logo: inputs.logo,
        colisageUrlOf: (reference) => this.colisageUrl(reference),
        colors: inputs.colors,
        resupplyColors: inputs.resupplyColors,
        deliveryNotes: inputs.deliveryNotes ?? new Map(),
      },
      calendar,
    );
    const archivable =
      inputs.shelves !== null && inputs.deliveryNotes !== null && inputs.tranches !== null;
    return { bytes, archivable };
  }

  private async dossierInputsOf(snapshot: ClosedSnapshot): Promise<DossierInputs> {
    const resupplies = snapshot.resupplies ?? [];
    const shelves = await this.shelvesOrNull(snapshot.serviceDay, [
      ...snapshot.orders.flatMap((order) => order.lines),
      ...resupplies.flatMap((resupply) => resupply.lines),
    ]);
    const orderIds = snapshot.orders.map((order) => order.orderId);
    const [colors, resupplyColors, logo, deliveryNotes, display, tranches] = await Promise.all([
      this.colors.colorsOf(orderIds),
      this.resupplyColors.colorsOf([...new Set(resupplies.map((resupply) => resupply.siteId))]),
      this.logo.load(),
      this.deliveryNotesOrNull(snapshot.serviceDay, orderIds),
      this.display.current(),
      // Le calendrier par tranche : les tranches de la fiche d'atelier.
      // Illisibles, le dossier part sans calendrier et n'est pas archivé.
      this.tranches.read(ServiceDay.of(snapshot.serviceDay)),
    ]);
    // Le rangement (sous-catégories) est lu au tirage et figé avec le papier
    // archivé, comme les rayons.
    const { showSubcategories } = display ?? ProductionDisplaySettings.defaults();
    return { shelves, colors, resupplyColors, logo, deliveryNotes, showSubcategories, tranches };
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
}
