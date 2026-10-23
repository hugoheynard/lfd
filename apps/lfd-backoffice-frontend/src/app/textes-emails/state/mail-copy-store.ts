import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  ContentLocale,
  MailCopyAdminView,
  MailCopyLocaleView,
  MailCopyMailView,
  MailCopyTextView,
} from '@lfd/contracts';
import { HttpErrorResponse } from '@angular/common/http';
import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { MailCopyService } from '../data/mail-copy.service';
import { groupMails } from '../rules/mail-groups';
import { type MailSpot, movedOrder, orderPending } from '../rules/mail-sections';
import { defaultChangedIn, pendingIn } from '../rules/mail-text';

/**
 * **Les textes des e-mails, tels que l'écran les tient** — la vue lue en
 * entier, l'e-mail ouvert, « Publier », et la retouche locale d'un texte après
 * une écriture acceptée (même mécanique que `ShopCopyStore` : le serveur
 * avance la révision d'exactement un, l'écran retouche en place ; un refus
 * pour conflit relit tout).
 *
 * Fourni par la page : son état ne survit pas à l'écran.
 */
@Injectable()
export class MailCopyStore {
  private readonly api = inject(MailCopyService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  private readonly view = signal<MailCopyAdminView | null>(null);

  readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  readonly loadError = signal<string | null>(null);
  readonly publishing = signal(false);
  /** La clé de l'e-mail ouvert ; le premier de la liste à défaut. */
  readonly selectedMail = signal<string | null>(null);
  /** Avance à chaque écriture acceptée : l'aperçu du brouillon se relit. */
  readonly drafts = signal(0);

  /** Écrire, publier, s'envoyer un essai : sans ce droit, l'écran se lit. */
  readonly canWrite = computed(() => this.permissions.can('b2b_storefront:write'));

  readonly mails = computed<readonly MailCopyMailView[]>(() => this.view()?.mails ?? []);
  readonly orphans = computed<readonly MailCopyTextView[]>(() => this.view()?.orphans ?? []);
  readonly groups = computed(() => groupMails(this.mails()));

  /** Recompté après chaque retouche, toutes langues, orphelins compris, et un par ordre de sections en attente. */
  readonly pendingCount = computed(
    () =>
      pendingIn(this.mails().flatMap((mail) => mail.texts)) +
      pendingIn(this.orphans()) +
      this.mails().filter((mail) => orderPending(mail.sectionOrder)).length,
  );

  /**
   * Les langues dont le texte d'origine a changé depuis la modification de
   * l'équipe (§2 quinquies) — recompté ici plutôt que lu dans
   * `defaultChangedCount`, pour tomber dès qu'une retouche l'efface.
   */
  readonly defaultChangedCount = computed(
    () =>
      defaultChangedIn(this.mails().flatMap((mail) => mail.texts)) +
      defaultChangedIn(this.orphans()),
  );

  /** La carte désignée par un clic dans l'aperçu (S4) — mise en évidence et défilée. */
  readonly spot = signal<MailSpot | null>(null);
  /** La section survolée dans l'écran : l'aperçu l'encadre (S4). */
  readonly hoveredSection = signal<string | null>(null);
  /** Pourquoi le dernier déplacement n'a pas pris : le refus (`400`) du serveur tel quel, ou le conflit (`409`) après relecture. */
  readonly orderRefusal = signal<string | null>(null);
  /** Un déplacement est en vol : les flèches attendent, la révision suivante n'est pas connue. */
  readonly moving = signal(false);

  readonly current = computed<MailCopyMailView | null>(() => {
    const mails = this.mails();
    const key = this.selectedMail();
    return mails.find((mail) => mail.mail === key) ?? mails[0] ?? null;
  });

  /** Lecture complète. Le premier échec vide l'écran ; un rechargement raté garde ce qu'on a. */
  async load(): Promise<void> {
    if (this.view() === null) {
      this.status.set('loading');
    }
    try {
      this.view.set(await this.api.load());
      this.loadError.set(null);
      this.status.set('ready');
    } catch (error) {
      this.loadError.set(httpErrorMessage(error, 'Les textes des e-mails n’ont pas pu être lus.'));
      if (this.view() === null) {
        this.status.set('failed');
      }
    }
  }

  /** Un texte, d'un e-mail du registre ou orphelin. */
  text(mail: string, path: string): MailCopyTextView | null {
    const match = (text: MailCopyTextView): boolean => text.mail === mail && text.path === path;
    return (
      this.mails()
        .find((view) => view.mail === mail)
        ?.texts.find(match) ??
      this.orphans().find(match) ??
      null
    );
  }

  /** Retouche une langue d'un texte après une écriture que le serveur a acceptée. */
  patch(
    mail: string,
    path: string,
    locale: ContentLocale,
    change: Partial<MailCopyLocaleView>,
  ): void {
    const view = this.view();
    if (view === null) {
      return;
    }
    const touch = (text: MailCopyTextView): MailCopyTextView =>
      text.mail !== mail || text.path !== path
        ? text
        : {
            ...text,
            locales: { ...text.locales, [locale]: { ...text.locales[locale], ...change } },
          };
    const mails = view.mails.map((entry) => {
      if (entry.mail !== mail) {
        return entry;
      }
      const texts = entry.texts.map(touch);
      return { ...entry, texts, pendingCount: pendingIn(texts) };
    });
    this.view.set({ ...view, mails, orphans: view.orphans.map(touch) });
    this.drafts.update((n) => n + 1);
  }

  /** Ouvre un e-mail : ce qui était désigné dans le précédent ne vaut plus. */
  open(mail: string): void {
    this.selectedMail.set(mail);
    this.spot.set(null);
    this.hoveredSection.set(null);
    this.orderRefusal.set(null);
  }

  /** Monte (`-1`) ou descend (`1`) une section d'un cran, en brouillon (S2). */
  async moveSection(mail: string, id: string, delta: -1 | 1): Promise<void> {
    const view = this.mails().find((entry) => entry.mail === mail);
    const order =
      view &&
      movedOrder(
        view.sections.map((s) => s.id),
        id,
        delta,
      );
    if (!view || !order || !this.canWrite() || this.moving()) {
      return;
    }
    await this.writeOrder(() =>
      this.api.saveSectionOrder({
        mail,
        order: [...order],
        expectedRevision: view.sectionOrder.revision,
      }),
    );
  }

  /** « Rétablir l'ordre » : celui du code, au prochain « Publier ». */
  async resetSectionOrder(mail: string): Promise<void> {
    const view = this.mails().find((entry) => entry.mail === mail);
    if (!view || !this.canWrite() || this.moving()) {
      return;
    }
    await this.writeOrder(() =>
      this.api.resetSectionOrder({ mail, expectedRevision: view.sectionOrder.revision }),
    );
  }

  /**
   * Une écriture d'ordre, puis une relecture : les positions et le compte en
   * attente viennent du serveur, pas d'un calcul de l'écran. Un `400` reste
   * affiché au-dessus des sections ; un `409` relit et prévient.
   */
  private async writeOrder(send: () => Promise<void>): Promise<void> {
    this.moving.set(true);
    this.orderRefusal.set(null);
    try {
      await send();
      await this.load();
      this.drafts.update((n) => n + 1);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 400) {
        this.orderRefusal.set(httpErrorMessage(error, 'Cet ordre a été refusé.'));
      } else if (error instanceof HttpErrorResponse && error.status === 409) {
        await this.load();
        this.orderRefusal.set(
          'Quelqu’un a déplacé ces sections pendant ce temps : l’ordre est relu, refaites le geste s’il tient toujours.',
        );
      } else {
        this.notify.error(error, 'L’ordre des sections n’a pas pu être enregistré.');
      }
    } finally {
      this.moving.set(false);
    }
  }

  /** Publier tout ce qui attend, puis relire. Un refus se dit et ne change rien. */
  async publish(): Promise<void> {
    if (!this.canWrite() || this.publishing()) {
      return;
    }
    this.publishing.set(true);
    try {
      const { version } = await this.api.publish();
      this.notify.success(`Textes des e-mails publiés — version ${version}.`);
    } catch (error) {
      this.notify.error(error, 'La publication a échoué.');
    } finally {
      await this.load();
      this.publishing.set(false);
    }
  }
}
