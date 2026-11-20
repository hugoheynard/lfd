import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { SubAccountMenu } from "../../domain/entities/sub-account-menu.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { companyNamed, type NamedRef } from "../../domain/events/journal-names.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { SubAccountMenuRepository } from "../../domain/ports/sub-account-menu.repository.js";
import { setWholeMenu, type RequestedMenu } from "../../domain/services/whole-menu.js";
import type { MenuAuthor } from "../../domain/value-objects/sub-account-menu-terms.js";

/** Une carte à enregistrer, et la société nommée pour le journal. */
export interface MenuToSave {
  readonly company: NamedRef;
  readonly menu: SubAccountMenu;
}

/**
 * **Prépare la carte entière d'un sous-compte**, la même pour le staff et
 * pour le principal : charge la société et sa carte, les met à l'état
 * demandé par l'agrégat. L'écriture et sa trace restent au handler, dans sa
 * transaction — c'est lui qui répond du geste.
 */
@Injectable()
export class SubAccountMenuWriting {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly menus: SubAccountMenuRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /**
   * @returns la carte à enregistrer, ou `null` quand elle est déjà dans cet état.
   * @throws {CompanyNotFoundError} la société n'existe pas.
   * @throws {NotASubAccountError} elle n'a pas de principal.
   * @throws {DuplicateMenuEntryError} un article demandé deux fois au même grain.
   * @throws {EmptyMenuReferenceError} une entrée ne désigne rien.
   */
  async prepare(
    companyId: string,
    author: MenuAuthor,
    requested: RequestedMenu,
  ): Promise<MenuToSave | null> {
    const company = await this.companies.load(companyId);
    if (company === null) {
      throw new CompanyNotFoundError(companyId);
    }
    const menu = setWholeMenu(
      await this.menus.load(companyId),
      {
        companyId,
        principalCompanyId: company.parentCompanyId,
        stamp: { author, at: this.clock.now() },
        nextId: () => this.ids.next(),
      },
      requested,
    );
    return menu === null ? null : { company: companyNamed(companyId, company), menu };
  }
}
