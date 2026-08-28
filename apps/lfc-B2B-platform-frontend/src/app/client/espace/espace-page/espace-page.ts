import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldIconComponent } from 'fold-ng';

import { ClientChrome } from '../../client-chrome.service';
import { ClientIdentity } from '../../client-identity.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { ContactCard } from '../contact-card/contact-card';
import { ClientEspace } from '../espace.service';
import { ReadyWell } from '../ready-well/ready-well';

/**
 * `/mon-espace` — l'accueil du client reconnu.
 *
 * Il répond à UNE question : qu'est-ce qui m'attend aujourd'hui ? D'où ce qui
 * n'y est pas. « Mes commandes » et « Mon compte » sont deux entrées de menu,
 * pas des actions ; « comme samedi dernier » vit dans l'écran de commande, là
 * où il sert au moment de commander ; remise, encours et KBIS sont de la
 * consultation. Le téléphone n'en garde donc que l'action, et le bureau y
 * rajoute la consultation parce qu'il a la colonne pour.
 *
 * ⚠️ L'OPÉRATION DATÉE (Pâques, Noël) devrait passer en tête de cet écran. Elle
 * n'y est pas parce que son modèle n'existe pas encore — c'est le cas 3 du
 * dossier, prévu en dernier. La réf le prévoit : sans opération en cours, le
 * bloc n'existe pas et « Nouvelle commande » reprend la tête. C'est exactement
 * l'état de cet écran aujourd'hui.
 */
@Component({
  selector: 'app-espace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ContactCard, FoldIconComponent, ReadyWell, RouterLink],
  templateUrl: './espace-page.html',
  styleUrl: './espace-page.scss',
})
export class EspacePage {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly espace = inject(ClientEspace);
  private readonly identity = inject(ClientIdentity);
  private readonly chrome = inject(ClientChrome);

  /** Le salut nomme, ou ne nomme pas — jamais du prénom de quelqu'un d'autre. */
  protected readonly hello = computed(() => {
    const name = this.identity.firstName();
    const copy = this.t().nav;
    return name === null ? copy.helloAnonymous : copy.hello.replace('{name}', name);
  });

  constructor() {
    this.chrome.kicker.set('');
    this.chrome.back.set(null);
    this.chrome.menu.set(true);
    this.chrome.bell.set(() => undefined);
    this.chrome.bellCount.set(0);
    this.chrome.barOnDesktop.set(true);
  }
}
