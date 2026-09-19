import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { PriceTemplateRepository } from "../../domain/ports/price-template.repository.js";
import { PriceTemplateNotFoundError } from "../../domain/pricing-errors.js";
import { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeRepository } from "../../domain/ports/company-mercuriale.repository.js";
import { ApplyPriceTemplateCommand } from "./apply-price-template.command.js";

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
      command.staffUserId,
    );

    await this.mercuriales.save(mercuriale, {
      subjectType: "mercuriale",
      subjectId: mercuriale.id,
      kind: "posed",
      actor: command.staffUserId,
      at: validFrom,
      // Le journal dit d'OÙ elle vient : six mois plus tard, « pourquoi ce
      // prix ? » se répond mieux par « le gabarit Club Med » que par une
      // décision dont personne ne sait avec quelles autres elle a été prise.
      // Le gabarit par son NOM du moment, plus par son identifiant (lot B du
      // plan des phrases, 2026-09-19) : c'est sous ce nom qu'on en parle.
      reason: `Posée par le gabarit « ${state.label} »`,
      summary: `Mercuriale « ${state.label} » — ${String(mercuriale.lines.length)} article(s), posée par gabarit`,
      subjectLabel: mercuriale.label,
    });
    return mercuriale.lines.length;
  }
}
