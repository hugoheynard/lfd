import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FoldIconComponent } from 'fold-ng';

import { AuthFacade } from '../../../auth/auth.facade';
import { ClientIdentity } from '../../client-identity.service';
import {
  ClientWorkspace,
  currentWorkspaceLabel,
  workspaceEntries,
} from '../../client-workspace.service';
import { ClientWorkspaceSwitch } from '../../client-workspace-switch.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { ClientFeatureAccess } from '../../feature-access/client-feature-access.service';
import { LangSwitch } from '../../lang-switch/lang-switch';
import { ClientNav } from '../client-nav.service';

/**
 * Le menu du POUCE : la page entière, et rien derrière.
 *
 * Il prend tout l'écran parce qu'à 390 px il n'y a pas de place pour deux
 * choses à la fois — un tiroir qui laisse voir la page sous un voile fait
 * cohabiter deux sujets et n'en sert bien aucun. La réf en profite pour donner
 * aux six destinations leur voix typographique : capitales, numérotées, une
 * par ligne.
 *
 * C'est un `<dialog>` natif, comme `ClientDialog` et pour les mêmes raisons —
 * piège de focus, `Escape`, inertie de la page derrière. Ce n'est pas
 * `ClientDialog` pour autant : celui-là impose un sur-titre, un titre et un
 * pied projetés, là où le menu porte son propre chrome de haut en bas. Deux
 * usages d'un `<dialog>`, pas deux emplois d'un même dialogue.
 *
 * Le SÉLECTEUR D'ESPACE est le même que dans le menu de l'initiale (plan
 * espace de travail, D8) : « Perso », puis une entrée par société, l'espace
 * courant marqué, et dessous l'enseigne en cours. Il n'existe qu'à partir d'une
 * société (Hugo, 2026-09-15) — sans rattachement, la ligne d'identité porte
 * l'adresse du compte, et rien ne se déroule vers nulle part.
 *
 * Le menu reste ouvert après un choix : la coche se déplace sous le pouce, et
 * c'est ce qui confirme la bascule avant qu'on retourne à la page.
 */
@Component({
  selector: 'app-client-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent, LangSwitch, RouterLink],
  templateUrl: './client-menu.html',
  styleUrl: './client-menu.scss',
})
export class ClientMenu {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly nav = inject(ClientNav);
  protected readonly access = inject(ClientFeatureAccess);
  protected readonly identity = inject(ClientIdentity);
  protected readonly workspace = inject(ClientWorkspace);
  private readonly switcher = inject(ClientWorkspaceSwitch);
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);

  /** Les espaces proposés, le courant marqué — les mêmes que le menu du bureau. */
  protected readonly spaces = computed(() =>
    workspaceEntries(
      this.workspace.options(),
      this.workspace.current(),
      this.t().chrome.workspacePersonal,
    ),
  );

  /** La ligne sous le sélecteur : l'enseigne en cours, ou « Compte perso ». */
  protected readonly currentSpace = computed(() =>
    currentWorkspaceLabel(this.workspace.company(), this.t().chrome.workspaceCurrentPersonal),
  );

  /** L'espace change, et l'écran suit — cf. `ClientWorkspaceSwitch`. */
  protected choose(workspace: string): void {
    void this.switcher.switchTo(workspace);
  }

  /** Le salut nomme, ou ne nomme pas — jamais du prénom de quelqu'un d'autre. */
  protected readonly hello = computed(() => {
    const name = this.identity.firstName();
    const copy = this.t().nav;
    return name === null ? copy.helloAnonymous : copy.hello.replace('{name}', name);
  });

  /** Ce qui est en cours, pour le point beurre : l'URL, pas un état gardé à part. */

  /** Le numéro d'ordre, `01`–`05` — la voix du menu pleine page. */
  protected rank(index: number): string {
    return `0${index + 1}`;
  }

  protected go(route: string): void {
    this.closed.emit();
    void this.router.navigateByUrl(route);
  }

  protected logout(): void {
    this.closed.emit();
    this.auth.logout();
  }

  private readonly host = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const el = this.host().nativeElement;
      // Le rendu serveur n'a pas de `showModal` : l'élément s'y écrit fermé.
      if (typeof el.showModal !== 'function') {
        return;
      }
      if (this.open()) {
        if (!el.open) {
          el.showModal();
        }
      } else if (el.open) {
        el.close();
      }
    });
  }
}
