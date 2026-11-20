import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { Company } from "../../domain/entities/company.js";
import type { PrincipalSitesMenu } from "../../domain/entities/principal-sites-menu.js";
import type { SubAccountMenu } from "../../domain/entities/sub-account-menu.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { NotASubAccountError } from "../../domain/errors/hierarchy-errors.js";
import { NoOwnMenuToResumeError } from "../../domain/errors/sub-account-menu-errors.js";
import { companyNamed, type NamedRef } from "../../domain/events/journal-names.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { PrincipalSitesMenuRepository } from "../../domain/ports/principal-sites-menu.repository.js";
import { SubAccountMenuRepository } from "../../domain/ports/sub-account-menu.repository.js";
import {
  setWholeMenu,
  setWholeSitesMenu,
  type RequestedMenu,
} from "../../domain/services/whole-menu.js";
import type {
  MenuAuthor,
  SiteMenuState,
} from "../../domain/value-objects/sub-account-menu-terms.js";

/** Une carte à enregistrer, et la société nommée pour le journal. */
export interface MenuToSave<M = SubAccountMenu> {
  readonly company: NamedRef;
  readonly menu: M;
}

/**
 * **Prépare une carte**, la même pour le staff et pour le client : charge la
 * société et sa carte, les met à l'état demandé par l'agrégat. L'écriture et
 * sa trace restent au handler, dans sa transaction — c'est lui qui répond du
 * geste.
 */
@Injectable()
export class SubAccountMenuWriting {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly menus: SubAccountMenuRepository,
    private readonly sitesMenus: PrincipalSitesMenuRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /**
   * La carte propre d'un site, rendue active.
   *
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
    const company = await this.loadCompany(companyId);
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

  /**
   * La carte commune des sites d'un principal.
   *
   * @returns la carte à enregistrer, ou `null` quand elle est déjà dans cet état.
   * @throws {CompanyNotFoundError} la société n'existe pas.
   * @throws {NotAPrincipalError} elle est elle-même un site.
   */
  async prepareSitesMenu(
    companyId: string,
    author: MenuAuthor,
    requested: RequestedMenu,
  ): Promise<MenuToSave<PrincipalSitesMenu> | null> {
    const company = await this.loadCompany(companyId);
    const menu = setWholeSitesMenu(
      await this.sitesMenus.load(companyId),
      {
        companyId,
        parentCompanyId: company.parentCompanyId,
        stamp: { author, at: this.clock.now() },
        nextId: () => this.ids.next(),
      },
      requested,
    );
    return menu === null ? null : { company: companyNamed(companyId, company), menu };
  }

  /**
   * **Le site suit la carte commune, ou reprend la sienne** — un état visé.
   * Un site sans carte propre suit déjà la carte commune : y revenir ne fait
   * rien ; reprendre une carte qu'il n'a pas est refusé.
   *
   * @returns la carte à enregistrer, ou `null` quand l'état est déjà atteint.
   * @throws {CompanyNotFoundError} la société n'existe pas.
   * @throws {NotASubAccountError} elle n'a pas de principal.
   * @throws {NoOwnMenuToResumeError} reprendre une carte propre qui n'existe pas.
   */
  async prepareState(
    companyId: string,
    author: MenuAuthor,
    state: SiteMenuState,
  ): Promise<MenuToSave | null> {
    const company = await this.loadCompany(companyId);
    if (company.parentCompanyId === null) {
      throw new NotASubAccountError(companyId);
    }
    const menu = await this.menus.load(companyId);
    if (menu === null) {
      if (state === "own") {
        throw new NoOwnMenuToResumeError(companyId);
      }
      return null;
    }
    const changed = menu.switchState(state, { author, at: this.clock.now() });
    return changed ? { company: companyNamed(companyId, company), menu } : null;
  }

  private async loadCompany(companyId: string): Promise<Company> {
    const company = await this.companies.load(companyId);
    if (company === null) {
      throw new CompanyNotFoundError(companyId);
    }
    return company;
  }
}
