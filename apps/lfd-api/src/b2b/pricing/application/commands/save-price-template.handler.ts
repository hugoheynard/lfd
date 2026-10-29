import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { PriceTemplate } from "../../domain/entities/price-template.js";
import { PriceTemplateRepository } from "../../domain/ports/price-template.repository.js";
import { PriceTemplateNotFoundError } from "../../domain/pricing-errors.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { assertOnSale } from "./sale-reference-support.js";
import { SavePriceTemplateCommand } from "./save-price-template.command.js";

@CommandHandler(SavePriceTemplateCommand)
export class SavePriceTemplateHandler implements ICommandHandler<SavePriceTemplateCommand, string> {
  constructor(
    private readonly templates: PriceTemplateRepository,
    private readonly ids: IdGenerator,
    private readonly references: SaleReferenceReader,
  ) {}

  async execute(command: SavePriceTemplateCommand): Promise<string> {
    // Un gabarit est une mercuriale en attente : la faute de frappe se dit ici,
    // pas le jour où on l'applique à un client (L5).
    await assertOnSale(
      this.references,
      command.payload.lines.map((line) => line.sku),
    );
    const draft = {
      kind: command.payload.kind,
      label: command.payload.label,
      lines: command.payload.lines.map((line) => ({
        sku: line.sku,
        tiers: line.tiers,
        // Recopié tel quel : le volume prévu accompagne la grille, il ne change
        // aucun prix — `templateToRules` ne le lit même pas.
        plannedVolume: line.plannedVolume,
      })),
    };
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
    draft: Parameters<typeof PriceTemplate.compose>[1],
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
