import type { Buffer } from "node:buffer";

import { Injectable } from "@nestjs/common";

import { BrandLogoSource } from "../../platform/brand/brand-logo.source.js";
import { AppConfig } from "../../platform/config/app-config.js";
import { Clock } from "../../platform/time/clock.js";
import { binLabelsFileName, renderBinLabelsPdf } from "../domain/services/bin-labels-pdf.js";
import { binLabelsPaperOf, type BinLabelsSource } from "./bin-labels-paper-of.js";

/** Un PDF servi : ses octets et le nom proposé. */
export interface BinLabelsFile {
  readonly fileName: string;
  readonly bytes: Buffer;
}

/**
 * **Le tirage des étiquettes de bacs** (2026-10-25) — partagé par les deux
 * propriétaires de bacs (une commande, un transfert) : deux handlers ne
 * s'appellent pas, ils partagent ce service. Compose, puis rend : l'instant
 * au `Clock`, l'origine du QR à `AppConfig`, le logo à `BrandLogoSource`.
 */
@Injectable()
export class BinLabelsPrint {
  constructor(
    private readonly clock: Clock,
    private readonly config: AppConfig,
    private readonly logo: BrandLogoSource,
  ) {}

  /** @throws {BinLabelsNothingToPrintError} aucun bac vivant à imprimer. */
  async print(source: BinLabelsSource, wanted: readonly string[]): Promise<BinLabelsFile> {
    const paper = binLabelsPaperOf(source, wanted, {
      adminBaseUrl: this.config.adminBaseUrl(),
      printedAt: this.clock.now(),
    });
    const bytes = await renderBinLabelsPdf(paper, await this.logo.load());
    return { fileName: binLabelsFileName(paper.title), bytes };
  }
}
