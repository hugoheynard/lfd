import type { PrincipalSitesMenu } from "../../../domain/entities/principal-sites-menu.js";
import type { SubAccountMenu } from "../../../domain/entities/sub-account-menu.js";
import { PrincipalSitesMenuRepository } from "../../../domain/ports/principal-sites-menu.repository.js";
import { SubAccountMenuRepository } from "../../../domain/ports/sub-account-menu.repository.js";

/** La carte d'UN site, en mémoire : ce qui est enregistré se relit. */
export class InMemoryMenus extends SubAccountMenuRepository {
  readonly saved: SubAccountMenu[] = [];

  constructor(private stored: SubAccountMenu | null = null) {
    super();
  }

  load(): Promise<SubAccountMenu | null> {
    return Promise.resolve(this.stored);
  }

  save(menu: SubAccountMenu): Promise<void> {
    this.saved.push(menu);
    this.stored = menu;
    return Promise.resolve();
  }
}

/** La carte commune d'UN principal, en mémoire. */
export class InMemorySitesMenus extends PrincipalSitesMenuRepository {
  readonly saved: PrincipalSitesMenu[] = [];

  constructor(private stored: PrincipalSitesMenu | null = null) {
    super();
  }

  load(): Promise<PrincipalSitesMenu | null> {
    return Promise.resolve(this.stored);
  }

  save(menu: PrincipalSitesMenu): Promise<void> {
    this.saved.push(menu);
    this.stored = menu;
    return Promise.resolve();
  }
}
