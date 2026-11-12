import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { PriceTemplate } from "../../domain/entities/price-template.js";
import { PriceTemplateRepository } from "../../domain/ports/price-template.repository.js";
import { PriceTemplateNotFoundError } from "../../domain/pricing-errors.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { type PriceTemplateDraft, priceTemplateDraftOf } from "./price-template-draft.js";
import { SavePriceTemplateCommand } from "./save-price-template.command.js";

@CommandHandler(SavePriceTemplateCommand)
export class SavePriceTemplateHandler implements ICommandHandler<SavePriceTemplateCommand, string> {
  constructor(
    private readonly templates: PriceTemplateRepository,
    private readonly ids: IdGenerator,
    private readonly references: SaleReferenceReader,
  ) {}

  async execute(command: SavePriceTemplateCommand): Promise<string> {
    const draft = await priceTemplateDraftOf(this.references, command.payload);
    const template = await this.resolve(command.id, draft, command.staffUserId);
    await this.templates.save(template);
    return template.id;
  }

  /**
   * Réviser passe par l'agrégat chargé, jamais par un `compose` déguisé : c'est
   * lui qui refuse de retoucher un gabarit archivé, et le contourner rendrait ce
   * refus décoratif.
   */
  private async resolve(
    id: string | null,
    draft: PriceTemplateDraft,
    staffUserId: string,
  ): Promise<PriceTemplate> {
    if (id === null) {
      return PriceTemplate.compose(this.ids.next(), draft, staffUserId);
    }
    const existing = await this.templates.load(id);
    if (existing === null) {
      throw new PriceTemplateNotFoundError(id);
    }
    return existing.revise(draft);
  }
}
