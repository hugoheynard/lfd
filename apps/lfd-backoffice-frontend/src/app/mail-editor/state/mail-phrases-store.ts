import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  MAIL_LOCALES,
  type MailEditorPhraseLocaleView,
  type MailEditorPhraseView,
  type MailLocale,
} from '@lfd/mail-blocks';

import { NotifyService } from '../../notify.service';
import { defaultChangedIn, upcomingText } from '../../textes-emails/rules/mail-text';
import { MailEditorService } from '../data/mail-editor.service';

/** Le temps de pause dans la frappe avant d'enregistrer le brouillon — celui de l'écran des textes. */
export const PHRASE_DRAFT_DEBOUNCE_MS = 800;

/** Une phrase dans une langue, identifiée dans l'e-mail ouvert. */
function phraseId(path: string, locale: MailLocale): string {
  return `${path}\u0000${locale}`;
}

/**
 * **Les phrases du modèle d'un e-mail ouvert** (plan `plan-editeur-par-blocs.md`,
 * § 3, S5b sur les routes de S4d) — la mécanique de `MailDraftWriter` de
 * l'écran des textes, sur les routes `mail_templates` :
 *
 * - chaque frappe part en brouillon après une pause, sur la révision lue ;
 * - un `400` (texte vide, variable obligatoire perdue ou inconnue) reste sous
 *   le champ, tel que le serveur le dit, et la frappe est gardée — les
 *   variables ne sont PAS revalidées ici : le serveur seul les connaît ;
 * - un `409` abandonne la frappe de la phrase, relit, et la phrase porte un
 *   avertissement jusqu'à la prochaine frappe ;
 * - les écritures d'une même phrase dans une langue se suivent.
 *
 * Fourni par la page d'un e-mail, qui le nourrit de `MailEditorView.phrases`.
 */
@Injectable()
export class MailPhrasesStore {
  private readonly api = inject(MailEditorService);
  private readonly notify = inject(NotifyService);

  private readonly template = signal<string | null>(null);
  readonly phrases = signal<readonly MailEditorPhraseView[]>([]);
  /** Les phrases que le code ne connaît plus (S5e) : lues, et seulement rétablies. */
  readonly orphans = signal<readonly MailEditorPhraseView[]>([]);
  private readonly typed = signal<ReadonlyMap<string, string>>(new Map());
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly chains = new Map<string, Promise<void>>();

  /** Les chemins dont une écriture a été refusée pour conflit. */
  readonly conflicts = signal<ReadonlySet<string>>(new Set());
  /** Les refus du serveur, par phrase et langue — son message, tel quel. */
  readonly refusals = signal<ReadonlyMap<string, string>>(new Map());

  /** Combien de phrases, toutes langues, attendent « Publier » — orphelines rétablies comprises. */
  readonly pendingCount = computed(
    () =>
      [...this.phrases(), ...this.orphans()]
        .flatMap((phrase) => MAIL_LOCALES.map((locale) => phrase.locales[locale]))
        .filter((view) => view.draftState !== 'unchanged').length,
  );

  /** Combien de langues portent « le texte d'origine a changé » — la règle de l'écran des textes. */
  readonly defaultChangedCount = computed(() => defaultChangedIn(this.phrases()));

  /** Pose les phrases lues avec l'e-mail ; oublie la frappe d'un autre e-mail. */
  use(
    template: string,
    phrases: readonly MailEditorPhraseView[],
    orphans: readonly MailEditorPhraseView[] = [],
  ): void {
    if (this.template() !== template) {
      for (const timer of this.timers.values()) {
        clearTimeout(timer);
      }
      this.timers.clear();
      this.typed.set(new Map());
      this.refusals.set(new Map());
      this.conflicts.set(new Set());
    }
    this.template.set(template);
    this.phrases.set(phrases);
    this.orphans.set(orphans);
  }

  textOf(phrase: MailEditorPhraseView, locale: MailLocale): string {
    return this.typed().get(phraseId(phrase.path, locale)) ?? upcomingText(phrase.locales[locale]);
  }

  refusalOf(phrase: MailEditorPhraseView, locale: MailLocale): string | null {
    return this.refusals().get(phraseId(phrase.path, locale)) ?? null;
  }

  edit(phrase: MailEditorPhraseView, locale: MailLocale, value: string): void {
    const id = phraseId(phrase.path, locale);
    this.typed.update((map) => new Map(map).set(id, value));
    this.forget(id, phrase.path);
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        void this.queue(id, () => this.save(phrase.path, locale));
      }, PHRASE_DRAFT_DEBOUNCE_MS),
    );
  }

  /** « Rétablir » : le texte du code, appliqué au prochain « Publier ». */
  async reset(phrase: MailEditorPhraseView, locale: MailLocale): Promise<void> {
    const id = phraseId(phrase.path, locale);
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.drop(id);
    this.forget(id, phrase.path);
    await this.queue(id, async () => {
      const template = this.template();
      const view = this.localeView(phrase.path, locale);
      if (template === null || view === undefined) {
        return;
      }
      await this.write(id, phrase.path, () =>
        this.api.resetPhrase(template, {
          path: phrase.path,
          locale,
          expectedRevision: view.revision,
        }),
      );
      this.patch(phrase.path, locale, {
        draftState: view.publishedText === null ? 'unchanged' : 'reset',
        draftText: null,
        revision: view.revision + 1,
      });
    });
  }

  /** Envoie ce qui attend la fin de la pause — avant « Publier », un aperçu ou un essai. */
  async flush(): Promise<void> {
    for (const [id, timer] of [...this.timers]) {
      clearTimeout(timer);
      this.timers.delete(id);
      const [path = '', locale] = id.split('\u0000');
      const known = MAIL_LOCALES.find((candidate) => candidate === locale);
      if (known !== undefined) {
        void this.queue(id, () => this.save(path, known));
      }
    }
    await Promise.all([...this.chains.values()]);
  }

  private async save(path: string, locale: MailLocale): Promise<void> {
    const id = phraseId(path, locale);
    const template = this.template();
    const value = this.typed().get(id);
    const view = this.localeView(path, locale);
    if (template === null || value === undefined || view === undefined) {
      return;
    }
    if (value === upcomingText(view)) {
      this.drop(id);
      return;
    }
    await this.write(id, path, () =>
      this.api.savePhraseDraft(template, {
        path,
        locale,
        text: value,
        expectedRevision: view.revision,
      }),
    );
    this.patch(path, locale, { draftState: 'set', draftText: value, revision: view.revision + 1 });
    if (this.typed().get(id) === value) {
      this.drop(id);
    }
  }

  /** Une écriture : un 400 reste sous le champ, un conflit relit, le reste se dit en toast. */
  private async write(id: string, path: string, send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 400) {
        this.refusals.update((map) =>
          new Map(map).set(id, httpErrorMessage(error, 'Cette phrase a été refusée.')),
        );
      } else if (error instanceof HttpErrorResponse && error.status === 409) {
        this.conflicts.update((set) => new Set(set).add(path));
        this.typed.update(
          (map) => new Map([...map].filter(([typedId]) => !typedId.startsWith(`${path}\u0000`))),
        );
        await this.reload();
      } else {
        this.notify.error(error, 'La phrase n’a pas pu être enregistrée.');
      }
      throw error;
    }
  }

  private async reload(): Promise<void> {
    const template = this.template();
    if (template === null) {
      return;
    }
    try {
      const view = await this.api.phrases(template);
      this.phrases.set(view.phrases);
      this.orphans.set(view.orphans);
    } catch (error) {
      this.notify.error(error, 'Les phrases n’ont pas pu être relues.');
    }
  }

  private localeView(path: string, locale: MailLocale): MailEditorPhraseLocaleView | undefined {
    return [...this.phrases(), ...this.orphans()].find((phrase) => phrase.path === path)?.locales[
      locale
    ];
  }

  private patch(
    path: string,
    locale: MailLocale,
    change: Partial<MailEditorPhraseLocaleView>,
  ): void {
    const apply = (phrases: readonly MailEditorPhraseView[]): readonly MailEditorPhraseView[] =>
      phrases.map((phrase) =>
        phrase.path === path
          ? {
              ...phrase,
              locales: { ...phrase.locales, [locale]: { ...phrase.locales[locale], ...change } },
            }
          : phrase,
      );
    this.phrases.update(apply);
    this.orphans.update(apply);
  }

  private queue(id: string, task: () => Promise<void>): Promise<void> {
    const next = (this.chains.get(id) ?? Promise.resolve()).then(task).catch(() => undefined);
    this.chains.set(id, next);
    return next;
  }

  private drop(id: string): void {
    this.typed.update((map) => {
      const next = new Map(map);
      next.delete(id);
      return next;
    });
  }

  /** Une nouvelle frappe efface le refus de cette langue et l'avertissement de conflit. */
  private forget(id: string, path: string): void {
    if (this.refusals().has(id)) {
      this.refusals.update((map) => {
        const next = new Map(map);
        next.delete(id);
        return next;
      });
    }
    if (this.conflicts().has(path)) {
      this.conflicts.update((set) => new Set([...set].filter((known) => known !== path)));
    }
  }
}
