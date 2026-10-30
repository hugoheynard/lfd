import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PriceTemplateRepository } from "../../domain/ports/price-template.repository.js";
import { PriceTemplateNotFoundError } from "../../domain/pricing-errors.js";
import { SaleReferenceLineageReader } from "../../domain/ports/sale-reference-lineage.reader.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { CarryOverPriceTemplateLineCommand } from "./carry-over-price-template-line.command.js";
import { assertDetachedFrom } from "./decision-carry-over-support.js";
import { assertOnSale } from "./sale-reference-support.js";

/**
 * **Remplacer l'ancienne référence par la nouvelle dans un gabarit**
 * (`plan-report-apres-detachement.md`, § 2.2, R5). Une édition, pas une
 * décision datée : le gabarit n'a ni fenêtre ni société. La filiation est
 * gardée comme pour tout report, et la vente aux pros comme à la saisie
 * (`SavePriceTemplateHandler`).
 */
@CommandHandler(CarryOverPriceTemplateLineCommand)
export class CarryOverPriceTemplateLineHandler implements ICommandHandler<
  CarryOverPriceTemplateLineCommand,
  string
> {
  constructor(
    private readonly templates: PriceTemplateRepository,
    private readonly lineage: SaleReferenceLineageReader,
    private readonly references: SaleReferenceReader,
  ) {}

  /**
   * Rend l'identifiant du gabarit édité.
   *
   * @throws {NotDetachedFromError} la nouvelle référence n'est pas née de l'ancienne.
   * @throws {SaleReferenceNotOnSaleError} la nouvelle ne se vend pas aux pros.
   * @throws {PriceTemplateNotFoundError} aucun gabarit de cet identifiant.
   * @throws les refus de `PriceTemplate.replaceSku`.
   */
  async execute(command: CarryOverPriceTemplateLineCommand): Promise<string> {
    const { fromSku, toSku } = command;
    await assertDetachedFrom(this.lineage, { fromSku, toSku });
    await assertOnSale(this.references, [toSku], "pro");
    const template = await this.templates.load(command.templateId);
    if (template === null) {
      throw new PriceTemplateNotFoundError(command.templateId);
    }
    await this.templates.save(template.replaceSku(fromSku, toSku));
    return template.id;
  }
}
