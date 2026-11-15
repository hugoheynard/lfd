import { Injectable } from "@nestjs/common";

import { BrandLogoSource } from "../../../../../platform/brand/brand-logo.source.js";
import { AppConfig } from "../../../../../platform/config/app-config.js";
import { OrderPrintColorsReader } from "../../../../channels/commerce/order-print-colors.reader.js";
import type { ProductionOrderSnapshot } from "../../../../day/index.js";
import {
  atelierSheetPdfKey,
  renderAtelierSheetPdf,
} from "../../domain/services/atelier-sheet-pdf.js";
import type { PaperDraft, PaperSlot } from "./production-paper-archive.service.js";

/** Ce que chaque fiche d'un lot reçoit au tirage : sa pastille et l'URL de son QR. */
export interface OrderSheetMarks {
  /** La couleur de chaque commande, par `orderId` ; absente : pas de pastille. */
  readonly colors: ReadonlyMap<string, string>;
  /** L'URL que le QR de colisage encode, ou une chaîne vide : aucun code imprimé. */
  readonly colisageUrlOf: (reference: string) => string;
}

/** La place de la fiche d'une commande dans l'archive. */
export function atelierSheetSlotOf(order: ProductionOrderSnapshot): PaperSlot {
  return {
    key: atelierSheetPdfKey(order.orderId),
    fileName: `fiche-atelier-${order.reference}.pdf`,
  };
}

/**
 * **La fiche de commande, papier commun de l'imprimerie** (décidé par Hugo le
 * 2026-11-15) : imprimée seule par l'atelier, en série dans le dossier du jour.
 * Ce qu'il faut pour la dessiner — la couleur de chaque commande, lue au
 * tirage par le port du commerce, et l'URL du QR de colisage — n'est collecté
 * qu'ici, pour que la fiche seule et la fiche du dossier ne divergent jamais.
 */
@Injectable()
export class OrderSheetPaper {
  constructor(
    private readonly config: AppConfig,
    private readonly colors: OrderPrintColorsReader,
    private readonly logo: BrandLogoSource,
  ) {}

  /** La fiche d'une commande, avec sa pastille et son QR. Toujours archivable. */
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

  /** Ce que les fiches de ces commandes portent, lu en une fois pour le lot. */
  async marksOf(orderIds: readonly string[]): Promise<OrderSheetMarks> {
    const colors = await this.colors.colorsOf(orderIds);
    return { colors, colisageUrlOf: (reference) => this.colisageUrl(reference) };
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
