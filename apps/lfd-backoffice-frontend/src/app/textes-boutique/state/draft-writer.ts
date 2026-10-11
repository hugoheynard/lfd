import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type { ContentLocale, ShopCopyEntryView } from '@lfd/contracts';

import { NotifyService } from '../../notify.service';
import { ShopCopyService } from '../data/shop-copy.service';
import { missingVariables, upcomingText } from '../rules/copy-text';
import { ShopCopyStore } from './shop-copy-store';

/** Le temps de pause dans la frappe avant d'enregistrer le brouillon. */
export const DRAFT_DEBOUNCE_MS = 800;

const idOf = (key: string, locale: ContentLocale): string => `${key}\u0000${locale}`;

/**
 * **L'enregistrement au fil de la frappe** (plan §7) : chaque texte tapé part
 * en brouillon après une pause, avec la révision lue. Un texte qui perd une
 * `{variable}` n'est pas envoyé — l'écran le refuse tout de suite, le serveur
 * reste l'autorité.
 *
 * Un `409` dit que quelqu'un a écrit ce texte entre-temps : la frappe locale de
 * la clé est abandonnée, l'écran relit, et la clé porte un avertissement
 * jusqu'à la prochaine frappe. On ne force jamais.
 *
 * Les écritures d'un même texte se suivent (`chain`) : la seconde part sur la
 * révision que la première a rendue, sans quoi l'écran se ferait refuser par
 * lui-même.
 */
@Injectable()
export class DraftWriter {
  private readonly api = inject(ShopCopyService);
  private readonly notify = inject(NotifyService);
  private readonly store = inject(ShopCopyStore);

  private readonly typed = signal<ReadonlyMap<string, string>>(new Map());
  private readonly timers = new Map<
    string,
    {
      readonly key: string;
      readonly locale: ContentLocale;
      readonly timer: ReturnType<typeof setTimeout>;
    }
  >();
  private readonly chains = new Map<string, Promise<void>>();

  /** La frappe qui attend son enregistrement, par langue : l'aperçu la montre déjà. */
  typedIn(locale: ContentLocale): ReadonlyMap<string, string> {
    const suffix = `\u0000${locale}`;
    return new Map(
      [...this.typed()]
        .filter(([id]) => id.endsWith(suffix))
        .map(([id, text]) => [id.slice(0, -suffix.length), text]),
    );
  }

  /** Les clés dont une écriture a été refusée pour conflit. */
  readonly conflicts = signal<ReadonlySet<string>>(new Set());

  /** Le texte à l'écran : la frappe en attente, sinon ce que Publier servira. */
  textOf(entry: ShopCopyEntryView, locale: ContentLocale): string {
    return this.typed().get(idOf(entry.key, locale)) ?? upcomingText(entry.locales[locale]);
  }

  /** Les variables que la frappe a perdues — une orpheline n'en a plus à garder. */
  missing(entry: ShopCopyEntryView, locale: ContentLocale): readonly string[] {
    return entry.space === null
      ? []
      : missingVariables(this.textOf(entry, locale), entry.variables);
  }

  edit(entry: ShopCopyEntryView, locale: ContentLocale, text: string): void {
    const id = idOf(entry.key, locale);
    this.typed.update((map) => new Map(map).set(id, text));
    this.forgetConflict(entry.key);
    this.cancel(id);
    if (this.missing(entry, locale).length > 0) {
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(id);
      void this.queue(id, () => this.save(entry.key, locale));
    }, DRAFT_DEBOUNCE_MS);
    this.timers.set(id, { key: entry.key, locale, timer });
  }

  /** « Revenir à l'original » : appliqué au prochain Publier. */
  async reset(entry: ShopCopyEntryView, locale: ContentLocale): Promise<void> {
    const id = idOf(entry.key, locale);
    this.cancel(id);
    this.drop(id);
    await this.queue(id, async () => {
      const view = this.store.entry(entry.key)?.locales[locale];
      if (view === undefined) {
        return;
      }
      await this.write(entry.key, () =>
        this.api.reset({ key: entry.key, locale, expectedRevision: view.revision }),
      );
      this.store.patch(entry.key, locale, {
        draftState: view.publishedText === null ? 'unchanged' : 'reset',
        draftText: null,
        revision: view.revision + 1,
      });
    });
  }

  /** Envoie tout de suite ce qui attend la fin de la pause — avant Publier. */
  async flush(): Promise<void> {
    for (const [id, { key, locale, timer }] of [...this.timers]) {
      clearTimeout(timer);
      this.timers.delete(id);
      void this.queue(id, () => this.save(key, locale));
    }
    await Promise.all([...this.chains.values()]);
  }

  private async save(key: string, locale: ContentLocale): Promise<void> {
    const id = idOf(key, locale);
    const text = this.typed().get(id);
    const view = this.store.entry(key)?.locales[locale];
    if (text === undefined || view === undefined) {
      return;
    }
    if (text === upcomingText(view)) {
      this.drop(id);
      return;
    }
    await this.write(key, () =>
      this.api.saveDraft({ key, locale, text, expectedRevision: view.revision }),
    );
    this.store.patch(key, locale, {
      draftState: 'set',
      draftText: text,
      revision: view.revision + 1,
    });
    if (this.typed().get(id) === text) {
      this.drop(id);
    }
  }

  /** Une écriture ; un refus se dit, un conflit relit — et interrompt la suite. */
  private async write(key: string, send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.conflicts.update((set) => new Set(set).add(key));
        this.typed.update(
          (map) => new Map([...map].filter(([id]) => !id.startsWith(`${key}\u0000`))),
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

  private forgetConflict(key: string): void {
    if (this.conflicts().has(key)) {
      this.conflicts.update((set) => new Set([...set].filter((k) => k !== key)));
    }
  }
}
