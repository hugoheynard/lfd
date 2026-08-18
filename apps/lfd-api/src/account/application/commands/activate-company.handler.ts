import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../infra/events/domain-event-publisher.js";
import { Clock } from "../../../infra/time/clock.js";
import {
  CompanyActivationBlockedError,
  CompanyNotFoundError,
} from "../../domain/errors/account-errors.js";
import { CompanyActivatedEvent } from "../../domain/events/company-activated.event.js";
import {
  AdminCompanyReader,
  type AdminCompanyDetailView,
} from "../../domain/ports/admin-company.reader.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { StaffDirectory } from "../../domain/ports/staff-directory.js";
import { activationGate } from "../../domain/services/activation-gate.js";
import { ActivateCompanyByStaffCommand } from "./activate-company.command.js";

/**
 * Active un compte client (Porte B). Deux responsabilités, séparées :
 *
 * 1. **Policy de complétude** (ici) : les pièces bloquantes doivent être là. La
 *    liste et le caractère bloquant sont écrits dans `activationGate`, en dur —
 *    plus aucun réglage ne les déplace. Elles croisent plusieurs tables : on les
 *    lit via la fiche staff (`AdminCompanyReader`), c'est une règle
 *    **cross-agrégat**, hors de `Company`.
 * 2. **Transition d'état** (l'agrégat) : `Company.activate()` porte le passage
 *    `pending → active` et **refuse** toute société qui n'est pas `pending`.
 *
 * Aucun mur membership : l'auth staff garde la route en amont.
 */
@CommandHandler(ActivateCompanyByStaffCommand)
export class ActivateCompanyByStaffHandler implements ICommandHandler<
  ActivateCompanyByStaffCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly reader: AdminCompanyReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly staff: StaffDirectory,
  ) {}

  async execute(command: ActivateCompanyByStaffCommand): Promise<void> {
    // 1) Policy : la fiche assemble les pièces (plusieurs tables) ; on bloque si
    //    une pièce requise manque.
    const view = await this.reader.byId(command.companyId);
    if (view === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    const gate = activationGate(view);
    if (gate.blocking.length > 0) {
      throw new CompanyActivationBlockedError(
        command.companyId,
        gate.blocking,
        `Activation impossible : ${gate.blocking.join(", ")}.`,
      );
    }

    // 2) Transition via l'agrégat, qui garde l'invariant « pending ». L'instant
    //    d'activation vient du `Clock` (temps métier de la requête) — l'agrégat
    //    reste pur, l'horloge est injectée.
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    const activatedAt = this.clock.now();
    // Joignabilité : le détenteur, ou n'importe lequel de ses interlocuteurs.
    // C'est souvent le responsable réception qui a le numéro utile — exiger
    // celui du gérant bloquerait un dossier complet par ailleurs.
    // La trace suit le même patron que la certification du KBIS : le `sub`
    // toujours, le nom et le titre quand l'annuaire les connaît, figés ici.
    const agent = await this.staff.identify(command.staffSub);
    company.activate(activatedAt, isReachable(view), {
      sub: command.staffSub,
      name: agent?.name ?? "",
      role: agent?.role ?? "",
    });
    await this.companies.save(company);

    // Jalon de conversion : publié après persistance de la transition.
    this.events.publish(new CompanyActivatedEvent(command.companyId, activatedAt));
  }
}

/**
 * Un numéro **quelque part** : sur le détenteur, ou sur n'importe lequel de ses
 * interlocuteurs. Un livreur qui cherche une porte doit pouvoir appeler
 * quelqu'un ; peu importe qui, tant que ça décroche.
 */
function isReachable(view: AdminCompanyDetailView): boolean {
  return (
    view.primaryContact.phone.trim() !== "" ||
    view.contacts.some((contact) => contact.phone.trim() !== "")
  );
}
