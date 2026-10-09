import { Injectable, computed, inject, signal } from '@angular/core';

import { ClientLocale } from '../client-locale.service';
import { ClientCopyService, fill } from '../copy/client-copy.service';
import { NOTIFICATIONS_DEMO } from './notifications.fixture';

/** Une ligne telle que le fil la dessine : le texte de la langue, et son état. */
export interface NotificationRow {
  readonly id: string;
  readonly subject: string;
  readonly body: string;
  readonly when: string;
  readonly read: boolean;
}

/**
 * **Le fil de notifications du client**, partagé par ses deux formes : le
 * popover de la cloche au bureau et la feuille du bas en pile.
 *
 * L'état « lu » vit ICI et non dans un composant : la feuille du bas est
 * recréée à chaque ouverture, et marquer comme lu dans l'une doit se voir dans
 * la pastille de l'autre. Il ne survit pas à un rechargement, et c'est honnête —
 * rien ne le persiste nulle part (cf. `notifications.fixture.ts`).
 */
@Injectable({ providedIn: 'root' })
export class NotificationsFeed {
  private readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale);

  /** ⚠️ LA SEULE lecture de la maquette. Le jour du vrai fil, cette ligne change, et elle seule. */
  private readonly feed = signal(NOTIFICATIONS_DEMO);

  /** Ce qui a été lu depuis l'ouverture de l'app. */
  private readonly readHere = signal<ReadonlySet<string>>(new Set());

  readonly rows = computed<readonly NotificationRow[]>(() => {
    const language = this.locale.current();
    const read = this.readHere();
    return this.feed().map((notification) => ({
      id: notification.id,
      ...notification.text[language],
      read: notification.read || read.has(notification.id),
    }));
  });

  readonly unread = computed(() => this.rows().filter((row) => !row.read).length);

  /** La ligne grise sous le titre : les non-lues, puis la profondeur du fil. */
  readonly countLine = computed(() =>
    fill(this.t().chrome.notificationsCount, {
      unread: String(this.unread()),
      total: String(this.rows().length),
    }),
  );

  markAll(): void {
    this.readHere.set(new Set(this.rows().map((row) => row.id)));
  }
}
