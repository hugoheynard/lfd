import type { Buffer } from "node:buffer";

import { Inject, Injectable, Logger } from "@nestjs/common";

import { BrandLogoSource } from "../../../../platform/brand/brand-logo.source.js";
import {
  type DeliveryNoteDrawing,
  PlannedDeliveryNotesReader,
} from "../../../channels/commerce/planned-delivery-notes.reader.js";
import { ResupplyPrintColorsReader } from "../../../channels/commerce/resupply-print-colors.reader.js";
import {
  type ProductionDay,
  type ProductionOrderSnapshot,
  type ProductionResupplySnapshot,
  ServiceDay,
} from "../../../day/index.js";
import {
  OrderSheetPaper,
  type OrderSheetMarks,
  type PaperDraft,
  ProductionDisplaySettings,
  ProductionDisplaySettingsReader,
  countColorSharesOf,
  countPaperRowsOf,
  renderProductionCountPdf,
} from "../../../shared/print/index.js";
import { dayDossierFrom } from "../../domain/services/day-dossier.js";
import {
  type CalendarPage,
  dossierCalendarOf,
} from "../../domain/services/day-dossier-calendar.js";
import { DossierDeadlinesReading } from "./dossier-deadlines-reading.service.js";
import { DossierFunctionSheetsReading } from "./dossier-function-sheets-reading.service.js";
import {
  type PreparedEventSheets,
  printedSheetIdsOf,
} from "../../domain/services/day-dossier-function-sheets-pdf.js";
import { GroupingSourceReading } from "../../../workstations/index.js";
import { type DossierStamp, renderDayDossierPdf } from "../../domain/services/day-dossier-pdf.js";
import type { ProvisionalStamp } from "../../domain/services/provisional-stamp.js";
import {
  type DossierSelection,
  WHOLE_DOSSIER,
  isWholeDossier,
  selectedOrders,
  selectionNotice,
} from "../../domain/services/day-dossier-selection.js";
import { closedSnapshotOf } from "./production-paper-slots.js";

export { dayDossierSlotOf, productionCountSlotOf } from "./production-paper-slots.js";

/** Ce que le dossier dessine : les commandes et réassorts d'un jour, figés ou en aperçu. */
export interface DossierContent {
  readonly serviceDay: string;
  readonly orders: readonly ProductionOrderSnapshot[];
  readonly resupplies: readonly ProductionResupplySnapshot[];
}

/** Ce que le dossier lit au tirage, chaque lecture faillible à `null`. */
interface DossierInputs {
  readonly grouping: Awaited<ReturnType<GroupingSourceReading["read"]>>;
  readonly marks: OrderSheetMarks;
  readonly resupplyColors: Awaited<ReturnType<ResupplyPrintColorsReader["colorsOf"]>>;
  readonly logo: Awaited<ReturnType<BrandLogoSource["load"]>>;
  readonly deliveryNotes: ReadonlyMap<string, DeliveryNoteDrawing> | null;
  /** Les commandes du papier sans BL vivant : un dossier qui en a n'est pas archivé. */
  readonly missingDeliveryNotes: number;
  readonly showSubcategories: boolean;
  readonly tranches: Awaited<ReturnType<DossierDeadlinesReading["read"]>>;
  /** `null` : illisibles ; vide quand la partie n'est pas cochée. */
  readonly functionSheets: readonly PreparedEventSheets[] | null;
}

/** Une impression provisoire : ses octets, et les fiches de fonction qu'elle porte. */
export interface ProvisionalPaper {
  readonly bytes: Buffer;
  readonly functionSheetIds: readonly string[];
}

/**
 * **Le rendu des papiers du fournil** : lire ce que chacun affiche et en
 * produire les octets. Il ne range rien — l'archive est à
 * `ProductionPaperArchive`. Le compte à produire se tire de ce que la
 * journée a figé, jamais de l'état d'aujourd'hui.
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
    @Inject(DossierFunctionSheetsReading)
    private readonly functionSheets: Pick<DossierFunctionSheetsReading, "read">,
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
   * sans fiches de fonction, et en mode prod sans postes.
   *
   * Une **sélection** (`selection`) tire des parties, des rayons ou des
   * commandes du même dossier figé ; les commandes se filtrent avant le
   * montage, si bien que la couverture et les totaux comptent la sélection —
   * et l'en-tête le dit. Un tirage partiel n'est jamais archivable.
   *
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   * @throws {DossierSelectionUnknownError} la sélection nomme une commande ou
   * un rayon que le dossier ne porte pas.
   */
  async dossierOf(
    day: ProductionDay,
    selection: DossierSelection = WHOLE_DOSSIER,
  ): Promise<PaperDraft> {
    const whole = closedSnapshotOf(day);
    const content = {
      serviceDay: whole.serviceDay,
      orders: whole.orders,
      resupplies: whole.resupplies ?? [],
    };
    const { bytes, inputs } = await this.drawn(
      content,
      {
        serviceDay: whole.serviceDay,
        closedAt: whole.closedAt,
        closedBy: whole.closedBy,
        retakenAt: whole.retaken?.at ?? null,
        retakenByName: whole.retakenByName,
        printRun: whole.retakeCount === undefined ? 1 : whole.retakeCount + 1,
      },
      selection,
    );
    const archivable = isWholeDossier(selection) && this.archivable(whole.serviceDay, inputs);
    return { bytes, archivable };
  }

  /**
   * **Une impression provisoire du dossier** — les mêmes dessins, tirés de ce
   * que l'arrêt figerait à cet instant (`content`), chaque page portant le
   * bandeau « Provisoire » (`provisional`). Jamais archivée ici : l'appelant
   * la range sous son numéro.
   *
   * @throws {DossierSelectionUnknownError} la sélection nomme une commande ou
   * un rayon que le contenu ne porte pas.
   */
  async provisionalOf(
    content: DossierContent,
    provisional: ProvisionalStamp,
    selection: DossierSelection,
  ): Promise<ProvisionalPaper> {
    const { bytes, inputs } = await this.drawn(
      content,
      {
        serviceDay: content.serviceDay,
        closedAt: provisional.printedAt,
        closedBy: null,
        retakenAt: null,
        retakenByName: null,
        printRun: provisional.run,
        provisional,
      },
      selection,
    );
    return { bytes, functionSheetIds: printedSheetIdsOf(inputs.functionSheets ?? []) };
  }

  /** Monte et rend le dossier d'un contenu, les commandes choisies avant le montage. */
  private async drawn(
    content: DossierContent,
    stamp: DossierStamp,
    selection: DossierSelection,
  ): Promise<{ readonly bytes: Buffer; readonly inputs: DossierInputs }> {
    const picked = { ...content, orders: selectedOrders(content.orders, selection) };
    const inputs = await this.dossierInputsOf(picked, selection);
    const dossier = dayDossierFrom(
      picked.orders,
      inputs.grouping.source,
      picked.resupplies,
      inputs.showSubcategories,
    );
    const calendar: readonly CalendarPage[] =
      inputs.tranches === null ? [] : dossierCalendarOf(dossier.recap, inputs.tranches);
    const bytes = await renderDayDossierPdf(
      dossier,
      stamp,
      {
        logo: inputs.logo,
        colisageUrlOf: inputs.marks.colisageUrlOf,
        colors: inputs.marks.colors,
        resupplyColors: inputs.resupplyColors,
        deliveryNotes: inputs.deliveryNotes ?? new Map(),
        functionSheets: inputs.functionSheets,
      },
      calendar,
      { selection, notice: selectionNotice(picked.orders.length, content.orders.length) },
    );
    return { bytes, inputs };
  }

  /** Un dossier dégradé n'est pas gardé : le tirage suivant le refera. Chaque refus est journalisé. */
  private archivable(serviceDay: string, inputs: DossierInputs): boolean {
    const causes = [
      inputs.grouping.shelvesKnown ? null : "rayons",
      inputs.deliveryNotes === null ? "bons de livraison" : null,
      inputs.missingDeliveryNotes > 0
        ? `${String(inputs.missingDeliveryNotes)} bon(s) de livraison pas encore né(s)`
        : null,
      inputs.tranches === null ? "tranches" : null,
      inputs.grouping.workstationsKnown ? null : "postes",
      inputs.functionSheets === null ? "fiches de fonction" : null,
    ].filter((cause): cause is string => cause !== null);
    if (causes.length === 0) {
      return true;
    }
    this.logger.warn(
      `Dossier du ${serviceDay} : tiré sans être archivé (incomplet : ${causes.join(", ")}) — le prochain tirage le refera.`,
    );
    return false;
  }

  private async dossierInputsOf(
    snapshot: DossierContent,
    selection: DossierSelection,
  ): Promise<DossierInputs> {
    const { resupplies } = snapshot;
    const lines = [
      ...snapshot.orders.flatMap((order) => order.lines),
      ...resupplies.flatMap((resupply) => resupply.lines),
    ];
    const orderIds = snapshot.orders.map((order) => order.orderId);
    const withSheets = selection.parts.has("functionSheets");
    const [marks, resupplyColors, logo, deliveryNotes, display, tranches, functionSheets] =
      await Promise.all([
        this.sheets.marksOf(orderIds),
        this.resupplyColors.colorsOf([...new Set(resupplies.map((resupply) => resupply.siteId))]),
        this.logo.load(),
        this.deliveryNotesOrNull(snapshot.serviceDay, orderIds),
        this.display.current(),
        // Le calendrier par tranche : les tranches de la fiche d'atelier.
        // Illisibles, le dossier part sans calendrier et n'est pas archivé.
        this.tranches.read(ServiceDay.of(snapshot.serviceDay)),
        withSheets ? this.functionSheets.read(snapshot.serviceDay) : Promise.resolve([]),
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
    return {
      grouping,
      marks,
      resupplyColors,
      logo,
      deliveryNotes,
      missingDeliveryNotes:
        deliveryNotes === null
          ? 0
          : orderIds.filter((orderId) => !deliveryNotes.has(orderId)).length,
      showSubcategories,
      tranches,
      functionSheets,
    };
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
