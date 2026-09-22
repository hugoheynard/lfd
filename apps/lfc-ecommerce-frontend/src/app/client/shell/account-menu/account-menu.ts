import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FoldIconComponent,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
  type FoldIconName,
} from 'fold-ng';

import { AuthFacade } from '../../../auth/auth.facade';
import { ClientIdentity } from '../../client-identity.service';
import {
  ClientWorkspace,
  currentWorkspaceLabel,
  workspaceEntries,
  workspaceInitials,
} from '../../client-workspace.service';
import { ClientWorkspaceSwitch } from '../../client-workspace-switch.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { ClientNav, type NavItem } from '../../nav/client-nav.service';

/** Une carte d'espace, telle que le panneau la dessine. */
interface SpaceCard {
  readonly value: string;
  readonly label: string;
  readonly current: boolean;
  readonly initials: string;
  /** PRO ou PERSO — la nature de l'espace, pas son état. */
  readonly kind: string;
  /**
   * La même nature, en booléen.
   *
   * ⚠️ Le LIBELLÉ ne peut pas en tenir lieu : la maquette peint la pastille
   * pro en encre pleine et la perso en beige, et comparer `kind` au mot
   * « Pro » ferait dépendre une couleur d'une traduction. Le jour où
   * l'italien dit « Azienda », la pastille change de couleur.
   */
  readonly pro: boolean;
  /** La ligne grise sous le nom : la raison sociale, ou ce qu'est un espace perso. */
  readonly note: string;
}

/** Le glyphe de chaque destination, par identifiant de `ClientNav`. */
const DESTINATION_ICONS: Readonly<Record<string, FoldIconName>> = {
  espace: 'home',
  shop: 'store',
  orders: 'package',
  invoices: 'receipt',
  baskets: 'repeat',
  account: 'company',
};

/**
 * **Le menu d'espaces**, au bout de la barre du bureau — un popover de 372 px
 * ancré sous le bouton d'identité (maquette du 2026-09-20).
 *
 * ## Ce qu'il est devenu
 *
 * C'était un `fold-dropdown` de deux entrées. Il porte désormais tout ce qu'une
 * personne a à atteindre depuis n'importe quel écran : qui elle est, POUR QUI
 * elle travaille, où elle peut aller, et comment elle sort. La sous-barre du
 * bureau a disparu le même jour — ses six destinations vivent ici.
 *
 * Il partage sa grammaire avec la cloche et le panier (`_popover.scss`) : même
 * largeur, même bande de tête, même pied. Les trois se lisent comme trois vues
 * d'un même objet, et c'est la seule chose qui rende une barre à trois
 * panneaux supportable.
 *
 * ## Ce qui ne bouge pas
 *
 * - **L'ordre des six destinations** est celui de `ClientNav`, et il ne se
 *   touche pas : la même liste sert le menu de poche. Voir le commentaire de
 *   `client-nav.service.ts`.
 * - **Le sélecteur d'espace n'existe qu'à partir d'une société** (Hugo,
 *   2026-09-15) — sans rattachement, il n'y a qu'un espace.
 * - **La bascule passe par `ClientWorkspaceSwitch`**, qui déclare l'espace ET
 *   emmène l'écran là où il a encore un sens.
 *
 * Un visiteur non reconnu n'a ni profil ni session : le bloc ne paraît pas.
 */
@Component({
  selector: 'app-account-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent, FoldPopoverComponent, FoldPopoverTriggerDirective, RouterLink],
  templateUrl: './account-menu.html',
  styleUrl: './account-menu.scss',
})
export class AccountMenu {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly identity = inject(ClientIdentity);
  protected readonly workspace = inject(ClientWorkspace);
  protected readonly nav = inject(ClientNav);
  private readonly switcher = inject(ClientWorkspaceSwitch);
  private readonly auth = inject(AuthFacade);

  protected readonly recognised = computed(() => this.auth.isAuthenticated());
  protected readonly open = signal(false);

  /** La ligne sous le sélecteur : l'enseigne en cours, ou « Compte perso ». */
  protected readonly currentSpace = computed(() =>
    currentWorkspaceLabel(this.workspace.company(), this.t().chrome.workspaceCurrentPersonal),
  );

  /** La pastille du déclencheur porte l'espace, pas la personne : c'est pour lui qu'on commande. */
  protected readonly spaceInitials = computed(() => workspaceInitials(this.currentSpace()));

  /**
   * La seconde ligne du déclencheur : « Camille · Compte pro ».
   *
   * Le prénom peut manquer (le compte naît sans nom) — la ligne se réduit alors
   * au rôle, plutôt que de commencer par un séparateur orphelin.
   */
  protected readonly whoLine = computed(() => {
    const copy = this.t().chrome;
    const role =
      this.workspace.company() === null ? copy.workspaceCurrentPersonal : copy.workspaceRolePro;
    const name = this.identity.firstName();
    return name === null ? role : `${name} · ${role}`;
  });

  /** Les initiales de la PERSONNE, pour l'avatar de la bande de tête. */
  protected readonly personInitials = computed(() => workspaceInitials(this.identity.fullName()));

  /**
   * Les cartes d'espace.
   *
   * `workspaceEntries()` nomme et marque — c'est la partie partagée avec le
   * menu de poche. La société elle-même se relit sur `options()`, dans le même
   * ordre : la fonction rend une entrée par option, sans filtrer.
   */
  protected readonly spaces = computed<readonly SpaceCard[]>(() => {
    const copy = this.t().chrome;
    const options = this.workspace.options();
    return workspaceEntries(options, this.workspace.current(), copy.workspacePersonal).map(
      (entry, index) => {
        const company = options[index]?.company ?? null;
        return {
          ...entry,
          initials: workspaceInitials(entry.label),
          kind: company === null ? copy.workspaceKindPersonal : copy.workspaceKindPro,
          pro: company !== null,
          note: company === null ? copy.workspacePersonalNote : company.raisonSociale,
        };
      },
    );
  });

  /**
   * Le nom du déclencheur : ce qu'il ouvre, puis le prénom qu'on voit. Le prénom
   * y reste pour que le nom entendu contienne ce qui est lu à l'écran.
   *
   * L'espace en cours s'y ajoute quand il y a un choix : la ligne qui le dit
   * dans le menu n'est pas une entrée, et un lecteur d'écran qui parcourt un
   * menu ne s'arrête que sur les entrées.
   */
  protected readonly triggerLabel = computed(() => {
    const name = this.identity.firstName();
    const copy = this.t().chrome;
    const label = name === null ? copy.accountMenu : `${copy.accountMenu} — ${name}`;
    return this.workspace.hasChoice()
      ? `${label} · ${copy.workspaceCurrentFor} ${this.currentSpace()}`
      : label;
  });

  /** Le glyphe d'une destination — `list` pour celle qu'on n'aurait pas prévue. */
  protected icon(item: NavItem): FoldIconName {
    return DESTINATION_ICONS[item.id] ?? 'list';
  }

  /** L'espace change, et l'écran suit — cf. `ClientWorkspaceSwitch`. */
  protected choose(workspace: string): void {
    this.open.set(false);
    void this.switcher.switchTo(workspace);
  }

  /** Partir quelque part referme le panneau : le lien a fait son travail. */
  protected close(): void {
    this.open.set(false);
  }

  /** La même sortie que le menu de poche. */
  protected logout(): void {
    this.open.set(false);
    this.auth.logout();
  }
}
