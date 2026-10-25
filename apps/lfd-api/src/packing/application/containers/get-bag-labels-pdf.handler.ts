import type { Buffer } from "node:buffer";

import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { OrderBagLabelReader } from "../../channels/commerce/index.js";
import { OrderLabelHeadReader } from "../../../production/channels/packing/index.js";
import { BrandLogoSource } from "../../../platform/brand/brand-logo.source.js";
import { Clock } from "../../../platform/time/clock.js";
import { PackingBoardReader } from "../../domain/ports/packing-board.reader.js";
import { bagsToPrint } from "../../domain/services/bag-labels.js";
import { bagLabelsFileName, renderBagLabelsPdf } from "../../domain/services/bag-labels-pdf.js";
import { readBagLabels } from "./bag-labels-reading.js";
import { GetBagLabelsPdfQuery } from "./get-bag-labels-pdf.query.js";

/** Un PDF servi : ses octets et le nom proposé. */
export interface BagLabelsFile {
  readonly fileName: string;
  readonly bytes: Buffer;
}

/**
 * **Les étiquettes des sacs d'une commande, en PDF** (2026-10-25, Hugo :
 * « imprimer l'étiquette devrait donner un beau PDF, là on est sur une
 * capture d'écran ») — A6, une étiquette par feuille. Une LECTURE tirée au
 * moment : rien n'est rangé, réimprimer relit les sacs vivants.
 *
 * @throws {BagLabelsSheetNotFoundError} la commande n'est pas au poste de ce jour.
 * @throws {BagLabelsNoBagError} la commande n'a aucun sac vivant.
 * @throws {BagLabelsBagNotFoundError} aucun des sacs demandés n'est vivant.
 */
@QueryHandler(GetBagLabelsPdfQuery)
export class GetBagLabelsPdfHandler implements IQueryHandler<GetBagLabelsPdfQuery, BagLabelsFile> {
  constructor(
    private readonly board: PackingBoardReader,
    private readonly heads: OrderLabelHeadReader,
    private readonly commerce: OrderBagLabelReader,
    private readonly logo: BrandLogoSource,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetBagLabelsPdfQuery): Promise<BagLabelsFile> {
    const sources = { board: this.board, heads: this.heads, commerce: this.commerce };
    const labels = await readBagLabels(sources, query.serviceDay, query.orderId);
    const bags = bagsToPrint(labels, query.containerIds);
    const bytes = await renderBagLabelsPdf(labels, bags, {
      printedAt: this.clock.now(),
      logo: await this.logo.load(),
    });
    return { fileName: bagLabelsFileName(labels.reference), bytes };
  }
}
