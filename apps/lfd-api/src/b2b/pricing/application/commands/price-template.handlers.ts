import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { ApplyPriceTemplatePayload, SavePriceTemplatePayload } from "@lfd/contracts";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { PriceTemplate } from "../../domain/entities/price-template.js";
import { PriceTemplateRepository } from "../../domain/ports/price-template.repository.js";
import { PriceTemplateNotFoundError } from "../../domain/pricing-errors.js";
import { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeRepository } from "../../domain/ports/company-mercuriale.repository.js";

/** Composer un gabarit, ou le réviser s'il en porte déjà un identifiant. */
export class SavePriceTemplateCommand {
  constructor(
    readonly id: string | null,
    readonly payload: SavePriceTemplatePayload,
    readonly staffSub: string,
  ) {}
}

/** **Poser** un gabarit chez un client : il devient des règles de mercuriale. */
export class ApplyPriceTemplateCommand {
  constructor(
    readonly id: string,
    readonly payload: ApplyPriceTemplatePayload,
    readonly staffSub: string,
  ) {}
}

@CommandHandler(SavePriceTemplateCommand)
export class SavePriceTemplateHandler implements ICommandHandler<SavePriceTemplateCommand, string> {
  constructor(
    private readonly templates: PriceTemplateRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: SavePriceTemplateCommand): Promise<string> {
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
    const template = await this.resolve(command.id, draft, command.staffSub);
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
    staffSub: string,
  ): Promise<PriceTemplate> {
    if (id === null) {
      return PriceTemplate.compose(this.ids.next(), draft, staffSub);
    }
    const existing = await this.templates.load(id);
    if (existing === null) {
      throw new PriceTemplateNotFoundError(id);
    }
    return existing.revise(draft);
  }
}

@CommandHandler(ApplyPriceTemplateCommand)
export class ApplyPriceTemplateHandler implements ICommandHandler<
  ApplyPriceTemplateCommand,
  number
> {
  constructor(
    private readonly templates: PriceTemplateRepository,
    private readonly mercuriales: CompanyMercurialeRepository,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * **Poser un gabarit chez un client, c'est poser SA mercuriale.**
   *
   * Rend le nombre d'**articles** posés.
   *
   * ## Ce qui a changé le 2026-09-08, et pourquoi ça compte
   *
   * Ce handler écrivait N règles — une par article et par palier —
   * **une par une, hors transaction**. Un refus à mi-parcours laissait le client
   * à moitié tarifé : quarante-deux articles posés, cinquante non, et personne
   * n'avait décidé ça. C'était le trou T3, et il se ferme ici sans qu'on ait eu
   * à ajouter une transaction : une mercuriale est UNE ligne, donc **atomique
   * par construction**.
   *
   * L'autre gain est qu'il n'y a plus deux façons de produire une mercuriale.
   * Les deux chemins — la fiche d'un compte et le gabarit — convergent sur le
   * même agrégat, donc sur le même jeu d'invariants. Tant qu'ils divergeaient,
   * une grille refusée d'un côté passait de l'autre.
   *
   * Le gabarit garde ses **paliers** : c'est lui qui les porte, et une
   * mercuriale à prix fixe n'est que la grille à un seul palier. Rien à
   * convertir.
   *
   * @throws {PriceTemplateNotFoundError} le gabarit n'existe pas.
   * @throws {RunningMercurialeError} une mercuriale couvre déjà cette période
   *   chez ce client. Écraser en silence une décision prise serait pire qu'un
   *   refus.
   */
  async execute(command: ApplyPriceTemplateCommand): Promise<number> {
    const template = await this.templates.load(command.id);
    if (template === null) {
      throw new PriceTemplateNotFoundError(command.id);
    }
    const state = template.toPersistence();
    const validFrom = new Date(command.payload.validFrom);
    const validTo = command.payload.validTo === null ? null : new Date(command.payload.validTo);

    const mercuriale = CompanyMercuriale.pose(
      this.ids.next(),
      {
        companyId: command.payload.companyId,
        label: state.label,
        // Les lignes du gabarit **telles quelles**, moins `plannedVolume` :
        // c'était l'hypothèse de négociation, elle a servi.
        lines: template.lines.map((line) => ({ sku: line.sku, tiers: line.tiers })),
        validFrom,
        validTo,
      },
      command.staffSub,
    );

    await this.mercuriales.save(mercuriale, {
      subjectType: "mercuriale",
      subjectId: mercuriale.id,
      kind: "posed",
      actor: command.staffSub,
      at: validFrom,
      // Le journal dit d'OÙ elle vient : six mois plus tard, « pourquoi ce
      // prix ? » se répond mieux par « le gabarit Club Med » que par une
      // décision dont personne ne sait avec quelles autres elle a été prise.
      reason: `Posée par le gabarit ${command.id}`,
      summary: `Mercuriale « ${state.label} » — ${String(mercuriale.lines.length)} article(s), posée par gabarit`,
    });
    return mercuriale.lines.length;
  }
}
