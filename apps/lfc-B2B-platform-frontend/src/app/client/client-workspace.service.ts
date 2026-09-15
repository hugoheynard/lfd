import { computed, inject, Injectable } from '@angular/core';
import type { CompanyView } from '@lfd/contracts';
// Par le sous-chemin sans zod : ce service est chargé au démarrage, par
// l'intercepteur (déploiement échoué le 2026-09-15 sur le budget du bundle).
import { PERSONAL_WORKSPACE } from '@lfd/contracts/workspace';

import { AccountService } from '../account/account.service';

/** Un espace proposable : `personal`, ou une société de la personne. */
export interface WorkspaceOption {
  /** {@link PERSONAL_WORKSPACE}, ou l'identifiant de la société. */
  readonly value: string;
  /** La société, `null` pour le perso. */
  readonly company: CompanyView | null;
}

/**
 * **L'espace dans lequel la personne travaille** — le perso, ou une de ses
 * sociétés (`documentation/b2b/plan-espace-de-travail.md`, D5 et D6).
 *
 * ## Pourquoi il décide côté front
 *
 * Le serveur ne sait pas deviner le perso de quelqu'un qui a UNE société : sans
 * en-tête, il résout cette société. L'espace se déclare donc, par l'en-tête
 * `x-lfc-company` que pose `workspaceInterceptor`, et ce service est la seule
 * source de la valeur déclarée. Le serveur la revérifie à chaque requête : une
 * préférence, pas une autorité.
 *
 * ## `null` tant que `/me` n'a pas répondu
 *
 * Et c'est la raison d'être de ce `null` : avant `/me`, on ne connaît ni les
 * rattachements ni la préférence. Deviner partirait sans en-tête — donc dans
 * l'espace que le serveur choisit, qui n'est pas forcément le bon — et un
 * panier relu là serait celui d'un autre espace (vitruve, B2). Les lecteurs
 * par espace ATTENDENT une valeur.
 *
 * Il se lit sur le compte relu et non sur `status` : une écriture de compte
 * repasse `status` en `loading` le temps de relire `/me`, et l'espace ne doit
 * pas redevenir inconnu pour autant.
 *
 * ## La règle par défaut (Hugo, 2026-09-15)
 *
 * La préférence si elle désigne encore le perso ou un rattachement ; sinon la
 * société si elle est la SEULE ; le perso à plusieurs sociétés comme sans
 * société. C'est ce que le serveur sert déjà sans en-tête : aucun changement de
 * prix ni de règlement pour qui n'a encore rien choisi.
 */
@Injectable({ providedIn: 'root' })
export class ClientWorkspace {
  private readonly account = inject(AccountService);

  /** L'espace courant, ou `null` tant que `/me` n'a pas répondu. */
  readonly current = computed<string | null>(() => {
    const account = this.account.account();
    if (account === null) {
      return null;
    }
    const ids = account.companies.map((company) => company.id);
    // `?? null` : un serveur d'avant le lot A rend un sac sans `workspace`.
    const preferred = account.navPrefs.workspace ?? null;
    if (preferred === PERSONAL_WORKSPACE || (preferred !== null && ids.includes(preferred))) {
      return preferred;
    }
    return ids.length === 1 ? (ids[0] ?? PERSONAL_WORKSPACE) : PERSONAL_WORKSPACE;
  });

  /** La société de l'espace courant — `null` en perso comme avant `/me`. */
  readonly company = computed<CompanyView | null>(() => {
    const current = this.current();
    return this.account.companies().find((company) => company.id === current) ?? null;
  });

  /** Vrai en perso, une fois l'espace connu. */
  readonly isPersonal = computed(() => this.current() === PERSONAL_WORKSPACE);

  /**
   * Il y a-t-il un choix à proposer ? Au moins une société (Hugo, 2026-09-15) :
   * qui n'en a aucune n'a qu'un espace, et un sélecteur à une entrée ne sert à
   * rien.
   */
  readonly hasChoice = computed(() => this.account.companies().length > 0);

  /** Les espaces proposés, le perso en tête puis les sociétés dans l'ordre de `/me`. */
  readonly options = computed<readonly WorkspaceOption[]>(() => [
    { value: PERSONAL_WORKSPACE, company: null },
    ...this.account.companies().map((company) => ({ value: company.id, company })),
  ]);

  /**
   * Bascule dans un espace. Sans effet sur une valeur qui n'est pas proposée :
   * l'écran n'a aucun moyen d'en produire une, et le serveur la refuserait.
   */
  choose(workspace: string): void {
    if (!this.options().some((option) => option.value === workspace)) {
      return;
    }
    this.account.setWorkspace(workspace);
  }
}

/** Le nom sous lequel une maison se reconnaît : son enseigne, sa raison sociale à défaut. */
export function companyName(company: Pick<CompanyView, 'enseigne' | 'raisonSociale'>): string {
  return company.enseigne.trim() === '' ? company.raisonSociale : company.enseigne;
}

/** Une entrée du sélecteur d'espace, telle qu'un menu l'affiche. */
export interface WorkspaceEntry {
  readonly value: string;
  readonly label: string;
  /** L'espace courant — marqué, jamais caché : on doit voir où l'on est. */
  readonly current: boolean;
}

/**
 * Les entrées du sélecteur, nommées : le perso sous son libellé, une maison par
 * son enseigne. Partagé par les deux menus (bureau et poche), qui doivent dire
 * la même chose avec deux mises en page.
 */
export function workspaceEntries(
  options: readonly WorkspaceOption[],
  current: string | null,
  personalLabel: string,
): readonly WorkspaceEntry[] {
  return options.map((option) => ({
    value: option.value,
    label: option.company === null ? personalLabel : companyName(option.company),
    current: option.value === current,
  }));
}

/** La ligne sous le sélecteur : l'enseigne en cours, ou le libellé du perso. */
export function currentWorkspaceLabel(company: CompanyView | null, personalLabel: string): string {
  return company === null ? personalLabel : companyName(company);
}
