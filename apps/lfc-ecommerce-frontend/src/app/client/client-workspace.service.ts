import { computed, inject, Injectable } from '@angular/core';
import type { CompanyView, ReachableSiteView } from '@lfd/contracts';
// Par le sous-chemin sans zod : ce service est chargé au démarrage, par
// l'intercepteur (déploiement échoué le 2026-09-15 sur le budget du bundle).
import { PERSONAL_WORKSPACE } from '@lfd/contracts/workspace';

import { AccountService } from '../account/account.service';
import { defaultProWorkspace } from '../account/default-workspace';

/** Un espace proposable : `personal`, ou une société de la personne. */
export interface WorkspaceOption {
  /** {@link PERSONAL_WORKSPACE}, ou l'identifiant de la société. */
  readonly value: string;
  /** La société, `null` pour le perso. */
  readonly company: CompanyView | null;
  /**
   * Le nom du principal par lequel on atteint ce SITE, `null` pour le perso
   * et pour une société propre (S6, `plan-entrer-dans-ses-sites.md` R5).
   */
  readonly via: string | null;
}

/**
 * **L'espace dans lequel la personne travaille** — le perso, ou une de ses
 * sociétés (`documentation/comptes-client/espace-de-travail.md`).
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
 * ## La règle par défaut (Hugo, 2026-09-15 ; révisée le 2026-10-20)
 *
 * La préférence si elle désigne encore le perso ou un rattachement ; sinon,
 * dès qu'il y a une société, **un espace pro** (`defaultProWorkspace`) ;
 * le perso seulement sans société.
 *
 * Révisée à la demande de la commerciale : « une personne qui a un compte pro
 * doit se retrouver dans un espace pro, pas son perso ». Avant, plusieurs
 * sociétés menaient au perso. Et **à chaque connexion**, un perso mémorisé
 * cède la place à l'espace pro (`AccountService`, au retour de `/me`) : la
 * personne peut y revenir pendant sa session, elle n'y retombe plus en
 * entrant.
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
    // Une société propre OU un site atteint (S6) : y être entré se mémorise
    // comme le reste. Un site détaché quitte `reachableSites` au `/me`
    // suivant, et l'espace retombe sur la règle par défaut — jamais sur un
    // site, que rien ne sert d'office (R4).
    const ids = [
      ...account.companies.map((company) => company.id),
      ...account.reachableSites.map((site) => site.company.id),
    ];
    // `?? null` : un serveur d'avant le lot A rend un sac sans `workspace`.
    const preferred = account.navPrefs.workspace ?? null;
    if (preferred === PERSONAL_WORKSPACE || (preferred !== null && ids.includes(preferred))) {
      return preferred;
    }
    return defaultProWorkspace(account.companies) ?? PERSONAL_WORKSPACE;
  });

  /** La société de l'espace courant — `null` en perso comme avant `/me`. */
  readonly company = computed<CompanyView | null>(() => {
    const current = this.current();
    return (
      this.account.companies().find((company) => company.id === current) ??
      this.reachableSite()?.company ??
      null
    );
  });

  /** Le site atteint par héritage où l'on travaille, `null` ailleurs. */
  readonly reachableSite = computed<ReachableSiteView | null>(() => {
    const current = this.current();
    return this.reachableSites().find((site) => site.company.id === current) ?? null;
  });

  /**
   * La facturation de l'espace (factures, impayés, compte bancaire) se
   * LIT-elle ? Dans une société propre, c'est son rôle qui le dit (`roleAllows`,
   * appelé par l'écran) — ce signal rend alors `null`. Dans un site atteint,
   * le rôle vaut `admin` pour le détenteur comme pour un admin hérité : seul
   * `canReadBilling` les distingue (Q1, Hugo, 2026-10-23).
   */
  readonly siteBillingReadable = computed<boolean | null>(
    () => this.reachableSite()?.canReadBilling ?? null,
  );

  private readonly reachableSites = computed<readonly ReachableSiteView[]>(
    () => this.account.account()?.reachableSites ?? [],
  );

  /** Vrai en perso, une fois l'espace connu. */
  readonly isPersonal = computed(() => this.current() === PERSONAL_WORKSPACE);

  /**
   * Il y a-t-il un choix à proposer ? Au moins une société (Hugo, 2026-09-15) :
   * qui n'en a aucune n'a qu'un espace, et un sélecteur à une entrée ne sert à
   * rien.
   */
  readonly hasChoice = computed(
    () => this.account.companies().length > 0 || this.reachableSites().length > 0,
  );

  /**
   * Les espaces proposés : le perso en tête, les sociétés propres, puis les
   * sites atteints par héritage, chacun dans l'ordre de `/me` (R5).
   */
  readonly options = computed<readonly WorkspaceOption[]>(() => [
    { value: PERSONAL_WORKSPACE, company: null, via: null },
    ...this.account.companies().map((company) => ({ value: company.id, company, via: null })),
    ...this.reachableSites().map((site) => ({
      value: site.company.id,
      company: site.company,
      via: site.via.name,
    })),
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

/**
 * Les initiales d'un espace, pour sa pastille : deux lettres au plus.
 *
 * Elles se prennent sur les deux PREMIERS mots, et non sur le premier et le
 * dernier : « Chalet Marmotte de la Daille » doit rendre `CM`, comme la
 * maquette — le dernier mot d'une enseigne est souvent un lieu.
 *
 * Vide en entrée, vide en sortie : on n'invente pas un signe pour un nom qu'on
 * n'a pas encore lu.
 */
export function workspaceInitials(label: string): string {
  const words = label.split(/\s+/u).filter((word) => word !== '');
  if (words.length === 0) {
    return '';
  }
  if (words.length === 1) {
    return (words[0] ?? '').slice(0, 2).toUpperCase();
  }
  return `${(words[0] ?? '').charAt(0)}${(words[1] ?? '').charAt(0)}`.toUpperCase();
}

/** Une entrée du sélecteur d'espace, telle qu'un menu l'affiche. */
export interface WorkspaceEntry {
  readonly value: string;
  readonly label: string;
  /** Le principal d'un site atteint, `null` ailleurs (cf. {@link WorkspaceOption.via}). */
  readonly via: string | null;
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
    via: option.via,
    current: option.value === current,
  }));
}

/** La ligne sous le sélecteur : l'enseigne en cours, ou le libellé du perso. */
export function currentWorkspaceLabel(company: CompanyView | null, personalLabel: string): string {
  return company === null ? personalLabel : companyName(company);
}
