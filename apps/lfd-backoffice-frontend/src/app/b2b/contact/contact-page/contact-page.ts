import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldViewNavComponent,
  type FoldViewNavItem,
} from 'fold-ng';

import { ContactInbox } from '../contact-inbox.store';

/**
 * **E-commerce LFC › Contact** — trois onglets (Hugo, 2026-10-09) : le contenu
 * de la carte de contact, les objets du formulaire « Nous écrire », et la
 * messagerie (`documentation/contenu-ecommerce/nous-contacter.md`).
 *
 * Chaque onglet est une sous-route : l'onglet se lit dans l'adresse, et la
 * cloche du back-office ouvre directement la messagerie par
 * `/b2b/contact/messages` (`CONTACT_MESSAGES_LINK` côté API), sans que l'API
 * ait à connaître la forme de l'écran.
 */
@Component({
  selector: 'app-contact-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldNavLayoutComponent, FoldPageLayoutComponent, FoldViewNavComponent, RouterOutlet],
  templateUrl: './contact-page.html',
})
export class ContactPage {
  private readonly inbox = inject(ContactInbox);

  protected readonly tabs = computed<FoldViewNavItem[]>(() => [
    { key: 'carte', label: 'Contenu de la carte', link: 'carte', icon: 'view' },
    { key: 'formulaire', label: 'Formulaire de contact', link: 'formulaire', icon: 'list' },
    {
      key: 'messages',
      label: 'Messagerie',
      link: 'messages',
      icon: 'inbox',
      // Rien à traiter : pas de pastille, plutôt qu'un « 0 » qui attire l'œil.
      badge: this.inbox.pendingCount() || null,
    },
  ]);

  constructor() {
    void this.inbox.refresh();
  }
}
