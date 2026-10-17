import { Logger } from "@nestjs/common";
import { CommandBus, CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { AudienceSwitchAppliedView, AudienceSwitchItemView } from "@lfd/pim-contracts";

import { DeactivateProductCommand } from "../../../catalogue/product/application/deactivate-product.js";
import { CatalogueReader } from "../../../catalogue/shared/domain/ports/catalogue-reader.js";
import { B2bMembershipService } from "../membership/membership.service.js";
import { invisibleToday, readAudienceSwitchScope } from "./audience-switch-support.js";

export class ApplyAudienceSwitchCommand {}

/**
 * **Appliquer la bascule vers l'audience** (2b1 de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`, H7) :
 * désactive les fiches publiées mais invisibles aujourd'hui — non liées au
 * canal B2B, ou dont la case `b2b` effective est fermée. C'est le second temps
 * de l'aperçu (`GetAudienceSwitchPreviewQuery`), qui les liste sous
 * `publishedUnbound` et `publishedB2bClosed`, lues par la même fonction
 * (`invisibleToday`).
 *
 * ## Ce qu'il écrit, et rien d'autre
 *
 * Le seul statut de ces fiches, par le geste « désactiver » du catalogue
 * (`DeactivateProductCommand`) : une transaction par fiche, un fait
 * `product.unpublished` au journal par fiche, l'émetteur des faits du
 * catalogue appelé dans la même transaction. Aucun contenu de fiche n'est touché
 * (H10) ; la liste rendue sert au retour arrière (réactiver).
 *
 * Le canal ne charge pas l'agrégat lui-même : le dépôt des fiches ne sort pas
 * du catalogue (ADR-13), et désactiver a déjà son cas d'usage, son journal et
 * son émission. Le doubler ferait deux « désactiver » qui divergeraient.
 *
 * Une fiche en échec est nommée et n'arrête pas les autres : elles sont
 * indépendantes, et rejouer le geste ne retouche que celles encore publiées.
 */
@CommandHandler(ApplyAudienceSwitchCommand)
export class ApplyAudienceSwitchHandler implements ICommandHandler<
  ApplyAudienceSwitchCommand,
  AudienceSwitchAppliedView
> {
  private readonly logger = new Logger(ApplyAudienceSwitchHandler.name);

  constructor(
    private readonly catalogue: CatalogueReader,
    private readonly membership: B2bMembershipService,
    private readonly commands: CommandBus,
  ) {}

  async execute(): Promise<AudienceSwitchAppliedView> {
    const scope = await readAudienceSwitchScope(this.catalogue, this.membership);
    const deactivated: AudienceSwitchItemView[] = [];
    const failed: AudienceSwitchItemView[] = [];
    for (const product of invisibleToday(scope)) {
      const item = { id: product.id, sku: product.sku, name: product.name.fr };
      try {
        await this.commands.execute(new DeactivateProductCommand(product.id));
        deactivated.push(item);
      } catch (cause) {
        this.logger.error(`Bascule : désactivation de la fiche ${product.sku} en échec`, cause);
        failed.push(item);
      }
    }
    return { deactivated, failed };
  }
}
