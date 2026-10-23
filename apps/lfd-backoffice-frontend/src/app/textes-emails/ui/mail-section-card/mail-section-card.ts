import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import type {
  MailCopyMailView,
  MailCopyTextView,
  MailSectionTextView,
  MailSectionView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import {
  FRAME_LABELS,
  type MailCardKey,
  type MailFrame,
  systemDescription,
  textHeading,
} from '../../rules/mail-sections';
import { defaultChangedIn } from '../../rules/mail-text';
import { MailCopyStore } from '../../state/mail-copy-store';
import { MailTextEditor } from '../mail-text-editor/mail-text-editor';

/** Un texte de la carte, prêt pour son éditeur. */
interface CardText {
  readonly view: MailCopyTextView;
  readonly heading: string | null;
}

/**
 * **Une carte par section d'un e-mail** (E4, S1, S2, S6) — ses textes dedans,
 * chaque variante sous son nom lisible, et un badge : « Texte » (ses textes la
 * font) ou « Système » (les données la produisent ; seuls ses libellés se
 * réécrivent). Les flèches montent ou descendent la section d'un cran.
 *
 * Un CADRE (objet, en-tête) prend la même carte, sans badge ni flèches : il
 * ne se déplace pas.
 *
 * Désignée par un clic dans l'aperçu, la carte s'encadre et défile jusqu'à
 * elle ; survolée, elle fait encadrer sa section dans l'aperçu (S4).
 */
@Component({
  selector: 'app-mail-section-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    MailTextEditor,
  ],
  templateUrl: './mail-section-card.html',
  styleUrl: './mail-section-card.scss',
})
export class MailSectionCard {
  readonly mail = input.required<MailCopyMailView>();
  /** La section — ou `null` pour un cadre. */
  readonly section = input<MailSectionView | null>(null);
  readonly frame = input<MailFrame | null>(null);
  /** Rang dans la liste ordonnable, et sa longueur : décide des flèches permises. */
  readonly index = input(0);
  readonly count = input(1);

  protected readonly store = inject(MailCopyStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly key = computed<MailCardKey>(() => {
    const section = this.section();
    return section === null ? `frame:${this.frame() ?? 'subject'}` : `section:${section.id}`;
  });

  protected readonly title = computed(() => {
    const section = this.section();
    return section === null ? FRAME_LABELS[this.frame() ?? 'subject'] : section.label;
  });

  protected readonly system = computed(() => this.section()?.nature === 'system');

  protected readonly subtitle = computed(() =>
    this.section() === null
      ? 'Cadre de l’e-mail : il reste à sa place.'
      : this.system()
        ? systemDescription(this.section()?.id ?? '')
        : undefined,
  );

  protected readonly texts = computed<readonly CardText[]>(() => {
    const declared: readonly MailSectionTextView[] =
      this.section()?.texts ?? this.mail().frames[this.frame() ?? 'subject'];
    return declared.flatMap((text) => {
      const view = this.mail().texts.find((candidate) => candidate.path === text.path);
      return view === undefined ? [] : [{ view, heading: textHeading(text, declared.length) }];
    });
  });

  /** Combien de langues de ses textes ont vu leur texte d'origine changer (§2 quinquies). */
  protected readonly defaultChanged = computed(() =>
    defaultChangedIn(this.texts().map((text) => text.view)),
  );

  protected readonly spotted = computed(() => this.store.spot()?.card === this.key());
  protected readonly spottedPath = computed(() =>
    this.spotted() ? (this.store.spot()?.path ?? null) : null,
  );

  constructor() {
    // Désignée dans l'aperçu : on la fait venir sous les yeux — le texte s'il y en a un.
    afterRenderEffect(() => {
      if (!this.spotted()) {
        return;
      }
      const path = this.spottedPath();
      const root = this.host.nativeElement;
      const target =
        [...root.querySelectorAll('[data-text-path]')].find(
          (element) => element.getAttribute('data-text-path') === path,
        ) ?? root;
      target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    });
  }

  protected move(delta: -1 | 1): void {
    const section = this.section();
    if (section !== null) {
      void this.store.moveSection(this.mail().mail, section.id, delta);
    }
  }

  protected hover(on: boolean): void {
    const section = this.section();
    if (section === null) {
      return;
    }
    if (on) {
      this.store.hoveredSection.set(section.id);
    } else if (this.store.hoveredSection() === section.id) {
      this.store.hoveredSection.set(null);
    }
  }
}
