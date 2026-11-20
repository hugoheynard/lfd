import { computed, inject, Injectable } from '@angular/core';
import type { AccountView, CompanyMemberRole, CompanyView } from '@lfd/contracts';

import { AccountService } from '../../account/account.service';
import { ClientContext } from '../client-context.service';

/**
 * Les rôles du principal qui règlent la carte de ses sites
 * (`carte-des-sites.md`, § 3.2) — le serveur les tient
 * (`canSetMenuOf`) ; l'écran ne propose pas un geste qui ne ferait que dire non.
 */
const MENU_SETTERS: ReadonlySet<CompanyMemberRole> = new Set(['owner', 'admin']);

/**
 * **Les sites dont la personne règle la carte, depuis l'espace où elle est.**
 *
 * L'espace doit être un principal tenu en propre (`principal`, jamais un site
 * atteint par héritage) où elle est propriétaire ou administratrice ; ses
 * sites sont ceux de `/me` qu'elle atteint PAR lui. Le rôle propre dans un
 * site n'ouvre rien : il est jugé sur le principal seul (§ 3.2).
 */
export function manageableSites(
  account: Pick<AccountView, 'reachableSites'> | null,
  principal: Pick<CompanyView, 'id' | 'role'> | null,
): readonly CompanyView[] {
  if (account === null || principal === null || !MENU_SETTERS.has(principal.role)) {
    return [];
  }
  return account.reachableSites
    .filter((site) => site.via.companyId === principal.id)
    .map((site) => site.company);
}

/**
 * Les sites réglables de l'espace affiché — lus par le menu (la destination
 * « Mes sites » n'existe qu'avec eux) et par les deux écrans.
 *
 * L'espace affiché est lu sur le préfixe du contexte, et le principal parmi
 * les sociétés PROPRES (`companies`) : un site atteint par héritage n'y figure
 * jamais, il ne peut donc pas passer pour un principal.
 */
@Injectable({ providedIn: 'root' })
export class ManageableSites {
  private readonly account = inject(AccountService);
  private readonly context = inject(ClientContext);

  readonly sites = computed<readonly CompanyView[]>(() => {
    const shown = this.context.prefix();
    const principal = this.account.companies().find((company) => company.id === shown) ?? null;
    return manageableSites(this.account.account(), principal);
  });

  /** Le compte est-il lu ? Un site inconnu ne se juge qu'après. */
  readonly settled = computed(() => {
    const status = this.account.status();
    return status === 'ready' || status === 'error';
  });

  /** Un site réglable de cet espace, ou `null`. */
  siteOf(subAccountId: string): CompanyView | null {
    return this.sites().find((site) => site.id === subAccountId) ?? null;
  }
}
