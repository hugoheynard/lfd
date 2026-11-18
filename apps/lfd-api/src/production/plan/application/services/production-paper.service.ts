import { Inject, Injectable, Logger } from "@nestjs/common";

import { BrandLogoSource } from "../../../../platform/brand/brand-logo.source.js";
import {
  type DeliveryNoteDrawing,
  PlannedDeliveryNotesReader,
} from "../../../channels/commerce/planned-delivery-notes.reader.js";
import { ResupplyPrintColorsReader } from "../../../channels/commerce/resupply-print-colors.reader.js";
import { ProductionDisplaySettings } from "../../../shared/print/index.js";
import { ProductionDisplaySettingsReader } from "../../../shared/print/index.js";
import type { ProductionDay, ProductionDaySnapshot } from "../../../day/index.js";
import { ProductionDayNotClosedError } from "../../../day/index.js";
import {
  OrderSheetPaper,
  type OrderSheetMarks,
  productionCountPdfKey,
  renderProductionCountPdf,
} from "../../../shared/print/index.js";
import { countColorSharesOf } from "../../../shared/print/index.js";
import { dayDossierFrom } from "../../domain/services/day-dossier.js";
import {
  type CalendarPage,
  dossierCalendarOf,
} from "../../domain/services/day-dossier-calendar.js";
import { ServiceDay } from "../../../day/index.js";
import { DossierDeadlinesReading } from "./dossier-deadlines-reading.service.js";
import { GroupingSourceReading } from "../../../workstations/index.js";
import { countPaperRowsOf } from "../../../shared/print/index.js";
import { dayDossierPdfKey, renderDayDossierPdf } from "../../domain/services/day-dossier-pdf.js";
import type { PaperDraft, PaperSlot } from "../../../shared/print/index.js";

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
  readonly grouping: Awaited<ReturnType<GroupingSourceReading["read"]>>;
  readonly marks: OrderSheetMarks;
  readonly resupplyColors: Awaited<ReturnType<ResupplyPrintColorsReader["colorsOf"]>>;
  readonly logo: Awaited<ReturnType<BrandLogoSource["load"]>>;
  readonly deliveryNotes: ReadonlyMap<string, DeliveryNoteDrawing> | null;
  readonly showSubcategories: boolean;
  readonly tranches: Awaited<ReturnType<DossierDeadlinesReading["read"]>>;
}

/**
 * **Le rendu des papiers du fournil** : lire ce que chacun affiche et en
 * produire les octets. La fiche de chaque commande, et ce qu'elle porte
 * (pastille, QR), sont à l'imprimerie (`OrderSheetPaper`). Il ne range rien — l'archive est à
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
    private readonly grouping: GroupingSourceReading,
    private readonly sheets: OrderSheetPaper,
    private readonly resupplyColors: ResupplyPrintColorsReader,
    private readonly logo: BrandLogoSource,
    private readonly deliveryNotes: PlannedDeliveryNotesReader,
    private readonly display: ProductionDisplaySettingsReader,
    // Le seul geste lu : `read`. Typé étroit pour qu'un test le double sans
    // la classe ; le jeton reste la classe, pour l'injection.
    @Inject(DossierDeadlinesReading)
    private readonly tranches: Pick<DossierDeadlinesReading, "read">,
  ) {}

  /**
   * Le compte à produire d'une journée. Toujours archivable.
   *
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   */
  async countOf(day: ProductionDay): Promise<PaperDraft> {
    const snapshot = closedSnapshotOf(day);
    const resupplies = snapshot.resupplies ?? [];
    const [{ colors }, resupplyColors, logo] = await Promise.all([
      this.sheets.marksOf(snapshot.orders.map((order) => order.orderId)),
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
   * le tirage suivant le refera avec ses rayons. Idem sans BL, sans tranches,
   * et en mode prod sans postes.
   *
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   */
  async dossierOf(day: ProductionDay): Promise<PaperDraft> {
    const snapshot = closedSnapshotOf(day);
    const resupplies = snapshot.resupplies ?? [];
    const inputs = await this.dossierInputsOf(snapshot);
    const dossier = dayDossierFrom(
      snapshot.orders,
      inputs.grouping.source,
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
        printRun: snapshot.retakeCount === undefined ? 1 : snapshot.retakeCount + 1,
      },
      {
        logo: inputs.logo,
        colisageUrlOf: inputs.marks.colisageUrlOf,
        colors: inputs.marks.colors,
        resupplyColors: inputs.resupplyColors,
        deliveryNotes: inputs.deliveryNotes ?? new Map(),
      },
      calendar,
    );
    return { bytes, archivable: this.archivable(snapshot.serviceDay, inputs) };
  }

  /**
   * Un dossier dégradé n'est pas gardé : le tirage suivant le refera. Chaque
   * refus est journalisé avec ses causes — rayons, BL, tranches, et en mode
   * prod les postes (`documentation/fournil/les-postes-du-fournil.md`, § 3.5).
   */
  private archivable(serviceDay: string, inputs: DossierInputs): boolean {
    const causes = [
      inputs.grouping.shelvesKnown ? null : "rayons",
      inputs.deliveryNotes === null ? "bons de livraison" : null,
      inputs.tranches === null ? "tranches" : null,
      inputs.grouping.workstationsKnown ? null : "postes",
    ].filter((cause): cause is string => cause !== null);
    if (causes.length === 0) {
      return true;
    }
    this.logger.warn(
      `Dossier du ${serviceDay} : tiré sans être archivé (illisibles : ${causes.join(", ")}) — le prochain tirage le refera.`,
    );
    return false;
  }

  private async dossierInputsOf(snapshot: ClosedSnapshot): Promise<DossierInputs> {
    const resupplies = snapshot.resupplies ?? [];
    const lines = [
      ...snapshot.orders.flatMap((order) => order.lines),
      ...resupplies.flatMap((resupply) => resupply.lines),
    ];
    const orderIds = snapshot.orders.map((order) => order.orderId);
    const [marks, resupplyColors, logo, deliveryNotes, display, tranches] = await Promise.all([
      this.sheets.marksOf(orderIds),
      this.resupplyColors.colorsOf([...new Set(resupplies.map((resupply) => resupply.siteId))]),
      this.logo.load(),
      this.deliveryNotesOrNull(snapshot.serviceDay, orderIds),
      this.display.current(),
      // Le calendrier par tranche : les tranches de la fiche d'atelier.
      // Illisibles, le dossier part sans calendrier et n'est pas archivé.
      this.tranches.read(ServiceDay.of(snapshot.serviceDay)),
    ]);
    // Le rangement (mode, sous-catégories, postes) est lu au tirage et figé
    // avec le papier archivé, comme les rayons.
    const settings = display ?? ProductionDisplaySettings.defaults();
    // Les SKU du jour — commandes ET réassorts, qui vont sur les mêmes fiches.
    const grouping = await this.grouping.read(
      lines.map((line) => line.sku),
      settings.grouping,
      `Dossier du ${snapshot.serviceDay}`,
    );
    const { showSubcategories } = settings;
    return { grouping, marks, resupplyColors, logo, deliveryNotes, showSubcategories, tranches };
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
}
