import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { NOTIFICATIONS_DEMO } from './notifications.fixture';

/** Une ligne telle que le panneau la dessine : le texte de la langue, et son état. */
interface NotificationRow {
  readonly id: string;
  readonly subject: string;
  readonly body: string;
  readonly when: string;
  readonly read: boolean;
}

/**
 * **La cloche**, et le popover de notifications qu'elle ouvre — même grammaire
 * que le menu d'espaces et que le panier (`_popover.scss`, maquette du
 * 2026-09-20).
 *
 * ## 🔴 Ce qu'il montre est une MAQUETTE
 *
 * Les lignes viennent de `notifications.fixture.ts`, qui dit en toutes lettres
 * qu'elles sont inventées, pourquoi, et quel est le seul point à rebrancher.
 * Aucun fil client n'existe côté serveur. Lire ce fichier avant de toucher à
 * quoi que ce soit ici.
 *
 * L'état « lu » vit dans un signal de ce composant : il ne survit pas à un
 * rechargement, et c'est honnête — rien ne le persiste nulle part. C'est aussi
 * l'endroit exact où l'appel d'écriture se posera.
 *
 * ## La non-lue ne se porte pas par la couleur seule
 *
 * Liséré or à gauche **et** graisse du sujet. Un daltonisme, un écran au soleil
 * ou un contraste forcé effacent une teinte ; ils n'effacent ni une barre ni
 * une graisse. C'est la règle de la maquette (SPEC §7), et elle vaut pour tout
 * ce qui distingue deux états d'une même ligne.
 *
 * ## Qui la porte
 *
 * Le shell la monte quand l'écran en demande une ET qu'il y a quelqu'un à
 * notifier : ce qui se notifie appartient à un compte.
 */
@Component({
  selector: 'app-notifications-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './notifications-menu.html',
  styleUrl: './notifications-menu.scss',
})
export class NotificationsMenu {
  protected readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale);

  protected readonly open = signal(false);

  /** ⚠️ LA SEULE lecture de la maquette. Le jour du vrai fil, cette ligne change, et elle seule. */
  private readonly feed = signal(NOTIFICATIONS_DEMO);

  /** Ce qui a été lu depuis l'ouverture de l'app — cf. le JSDoc de la classe. */
  private readonly readHere = signal<ReadonlySet<string>>(new Set());

  protected readonly rows = computed<readonly NotificationRow[]>(() => {
    const language = this.locale.current();
    const read = this.readHere();
    return this.feed().map((notification) => ({
      id: notification.id,
      ...notification.text[language],
      read: notification.read || read.has(notification.id),
    }));
  });

  protected readonly unread = computed(() => this.rows().filter((row) => !row.read).length);

  /** Le compte fait partie du NOM du bouton : sans lui, la pastille est muette. */
  protected readonly bellLabel = computed(() => {
    const label = this.t().chrome.notifications;
    const count = this.unread();
    return count > 0 ? `${label} — ${count}` : label;
  });

  /** La ligne grise de la bande de tête : les non-lues, puis la profondeur du fil. */
  protected readonly countLine = computed(() =>
    fill(this.t().chrome.notificationsCount, {
      unread: String(this.unread()),
      total: String(this.rows().length),
    }),
  );

  /** Ne paraît que s'il reste quelque chose à marquer. */
  protected markAll(): void {
    this.readHere.set(new Set(this.rows().map((row) => row.id)));
  }

  protected close(): void {
    this.open.set(false);
  }
}
