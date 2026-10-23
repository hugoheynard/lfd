import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type { ContentLocale, MailCopyTextView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import { NotifyService } from '../../notify.service';
import { MailCopyService } from '../data/mail-copy.service';
import { textId, textKey, upcomingText } from '../rules/mail-text';
import { MailCopyStore } from './mail-copy-store';

/** Le temps de pause dans la frappe avant d'enregistrer le brouillon. */
export const MAIL_DRAFT_DEBOUNCE_MS = 800;

interface Pending {
  readonly mail: string;
  readonly path: string;
  readonly locale: ContentLocale;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * **L'enregistrement au fil de la frappe**, sur le modèle de `DraftWriter`
 * des textes de la boutique, à une différence près : la validation des
 * variables (C5) n'est PAS doublée ici. Le serveur est le seul à connaître
 * les variables permises de chaque texte, et son refus (`400`) s'affiche tel
 * quel sous le champ, qui garde la frappe.
 *
 * Un `409` dit que quelqu'un a écrit entre-temps : la frappe du texte est
 * abandonnée, l'écran relit, et le texte porte un avertissement jusqu'à la
 * prochaine frappe. Les écritures d'une même langue se suivent (`chain`).
 */
@Injectable()
export class MailDraftWriter {
  private readonly api = inject(MailCopyService);
  private readonly notify = inject(NotifyService);
  private readonly store = inject(MailCopyStore);

  private readonly typed = signal<ReadonlyMap<string, string>>(new Map());
  private readonly timers = new Map<string, Pending>();
  private readonly chains = new Map<string, Promise<void>>();

  /** Les textes (e-mail + chemin) dont une écriture a été refusée pour conflit. */
  readonly conflicts = signal<ReadonlySet<string>>(new Set());
  /** Les refus du serveur, par texte et langue — son message, tel quel. */
  readonly refusals = signal<ReadonlyMap<string, string>>(new Map());

  textOf(text: MailCopyTextView, locale: ContentLocale): string {
    return (
      this.typed().get(textId(text.mail, text.path, locale)) ?? upcomingText(text.locales[locale])
    );
  }

  refusalOf(text: MailCopyTextView, locale: ContentLocale): string | null {
    return this.refusals().get(textId(text.mail, text.path, locale)) ?? null;
  }

  edit(text: MailCopyTextView, locale: ContentLocale, value: string): void {
    const id = textId(text.mail, text.path, locale);
    this.typed.update((map) => new Map(map).set(id, value));
    this.forget(id, text);
    this.cancel(id);
    const timer = setTimeout(() => {
      this.timers.delete(id);
      void this.queue(id, () => this.save(text.mail, text.path, locale));
    }, MAIL_DRAFT_DEBOUNCE_MS);
    this.timers.set(id, { mail: text.mail, path: text.path, locale, timer });
  }

  /** « Rétablir » : le texte du code, appliqué au prochain « Publier ». */
  async reset(text: MailCopyTextView, locale: ContentLocale): Promise<void> {
    const id = textId(text.mail, text.path, locale);
    this.cancel(id);
    this.drop(id);
    this.forget(id, text);
    await this.queue(id, async () => {
      const view = this.store.text(text.mail, text.path)?.locales[locale];
      if (view === undefined) {
        return;
      }
      await this.write(id, textKey(text), () =>
        this.api.reset({
          mail: text.mail,
          path: text.path,
          locale,
          expectedRevision: view.revision,
        }),
      );
      this.store.patch(text.mail, text.path, locale, {
        draftState: view.publishedText === null ? 'unchanged' : 'reset',
        draftText: null,
        revision: view.revision + 1,
      });
    });
  }

  /** Envoie tout de suite ce qui attend la fin de la pause — avant « Publier » ou un aperçu. */
  async flush(): Promise<void> {
    for (const [id, { mail, path, locale, timer }] of [...this.timers]) {
      clearTimeout(timer);
      this.timers.delete(id);
      void this.queue(id, () => this.save(mail, path, locale));
    }
    await Promise.all([...this.chains.values()]);
  }

  private async save(mail: string, path: string, locale: ContentLocale): Promise<void> {
    const id = textId(mail, path, locale);
    const value = this.typed().get(id);
    const view = this.store.text(mail, path)?.locales[locale];
    if (value === undefined || view === undefined) {
      return;
    }
    if (value === upcomingText(view)) {
      this.drop(id);
      return;
    }
    await this.write(id, textKey({ mail, path }), () =>
      this.api.saveDraft({ mail, path, locale, text: value, expectedRevision: view.revision }),
    );
    this.store.patch(mail, path, locale, {
      draftState: 'set',
      draftText: value,
      revision: view.revision + 1,
    });
    if (this.typed().get(id) === value) {
      this.drop(id);
    }
  }

  /** Une écriture : un 400 reste sous le champ, un conflit relit, le reste se dit en toast. */
  private async write(id: string, key: string, send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 400) {
        this.refusals.update((map) =>
          new Map(map).set(id, httpErrorMessage(error, 'Ce texte a été refusé.')),
        );
      } else if (error instanceof HttpErrorResponse && error.status === 409) {
        this.conflicts.update((set) => new Set(set).add(key));
        this.typed.update(
          (map) => new Map([...map].filter(([typedId]) => !typedId.startsWith(`${key}\u0000`))),
        );
        await this.store.load();
      } else {
        this.notify.error(error, 'Le brouillon n’a pas pu être enregistré.');
      }
      throw error;
    }
  }

  private queue(id: string, task: () => Promise<void>): Promise<void> {
    const next = (this.chains.get(id) ?? Promise.resolve()).then(task).catch(() => undefined);
    this.chains.set(id, next);
    return next;
  }

  private cancel(id: string): void {
    clearTimeout(this.timers.get(id)?.timer);
    this.timers.delete(id);
  }

  private drop(id: string): void {
    this.typed.update((map) => {
      const next = new Map(map);
      next.delete(id);
      return next;
    });
  }

  /** Une nouvelle frappe efface le refus de cette langue et l'avertissement de conflit. */
  private forget(id: string, text: MailCopyTextView): void {
    if (this.refusals().has(id)) {
      this.refusals.update((map) => {
        const next = new Map(map);
        next.delete(id);
        return next;
      });
    }
    const key = textKey(text);
    if (this.conflicts().has(key)) {
      this.conflicts.update((set) => new Set([...set].filter((k) => k !== key)));
    }
  }
}
