import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { MailValueResource } from '@lfd/mail-blocks';
import { FoldCalloutComponent } from 'fold-ng';

import { insertChipAt, readDictionaryText, variableChip } from '../../rules/mail-editable-text';
import { isSafeMailFragment } from '../../rules/mail-fragments';
import { imageFramingStyle } from '../../rules/mail-image-framing';
import { labelValueChip, valueRefusal } from '../../rules/mail-resources';

/** Le type de donnée d'une valeur glissée depuis les ressources de la colonne de gauche. */
export const VARIABLE_DRAG_TYPE = 'application/x-lfd-mail-variable';

/** Le texte d'une phrase, relu au format du dictionnaire. */
export interface PhraseInput {
  readonly path: string;
  readonly text: string;
}

/** Le texte d'un bloc libre dans une langue. */
export interface FreeBlockInput {
  readonly blockId: string;
  readonly locale: string;
  readonly text: string;
}

const PHRASE_ZONE = '[data-phrase][contenteditable]';
const EDITABLE_ZONE = '[data-phrase][contenteditable], [data-free-block][contenteditable]';

/**
 * **Un fragment d'e-mail rendu par le serveur, écrit sur place** (plan
 * `plan-editeur-par-blocs.md`, § 22, S5f).
 *
 * Le HTML vient de notre API, qui échappe les données ; il est injecté tel
 * quel, sans rien de tiers — et refusé s'il porte un script, un gestionnaire
 * ou une adresse `javascript:` (`isSafeMailFragment`). Les zones marquées que
 * l'écran sait réécrire deviennent modifiables : une phrase connue
 * (`phrasePaths`) et le texte d'un bloc libre du document (`freeBlockIds`) ;
 * les variables y sont des pastilles non modifiables.
 *
 * 🔴 Un fragment qui contient le focus n'est PAS remplacé : le rendu suivant
 * attend que le focus le quitte. Remplacer le HTML sous les doigts perdrait la
 * frappe en cours et le curseur.
 *
 * Les liens ne s'ouvrent pas : on écrit l'e-mail, on ne le lit pas.
 */
@Component({
  selector: 'app-mail-block-fragment',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent],
  templateUrl: './mail-block-fragment.html',
  styleUrl: './mail-block-fragment.scss',
})
export class MailBlockFragment {
  readonly html = input.required<string>();
  readonly canWrite = input(false);
  /** Les phrases que l'écran sait réécrire (`MailEditorPhraseView.path`). */
  readonly phrasePaths = input<ReadonlySet<string>>(new Set());
  /** Les blocs libres du document à l'écran. */
  readonly freeBlockIds = input<ReadonlySet<string>>(new Set());
  /** Le nom des zones modifiables, pour les lecteurs d'écran. */
  readonly zoneLabel = input('Texte de l’e-mail');
  /**
   * Les fiches des valeurs de l'e-mail (§ 24) : une pastille montre le nom
   * lisible, et une valeur ne se pose que dans une phrase qui la reçoit.
   */
  readonly values = input<ReadonlyMap<string, MailValueResource>>(new Map());

  readonly phraseInput = output<PhraseInput>();
  readonly freeBlockInput = output<FreeBlockInput>();
  /** Une valeur déposée dans une phrase qui ne la reçoit pas : le mot du refus. */
  readonly valueRefused = output<string>();

  protected readonly safe = computed(() => isSafeMailFragment(this.html()));

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  /** Le HTML posé dans le DOM, et celui qui attend que le focus parte. */
  private applied: string | null = null;
  private pending: string | null = null;

  constructor() {
    effect(() => {
      const element = this.host().nativeElement;
      const html = this.safe() ? this.html() : '';
      const canWrite = this.canWrite();
      const phrases = this.phrasePaths();
      const freeBlocks = this.freeBlockIds();
      const label = this.zoneLabel();
      const values = this.values();
      if (html !== this.applied) {
        if (this.holdsFocus(element)) {
          this.pending = html;
          return;
        }
        this.replace(element, html);
      }
      this.decorate(element, { canWrite, phrases, freeBlocks, label, values });
    });
  }

  protected onInput(event: Event): void {
    const zone = event.target instanceof Element ? event.target.closest(EDITABLE_ZONE) : null;
    if (zone !== null) {
      this.emitZone(zone);
    }
  }

  protected onClick(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('a') !== null) {
      event.preventDefault();
    }
  }

  protected onFocusOut(event: FocusEvent): void {
    const element = this.host().nativeElement;
    if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) {
      return;
    }
    if (this.pending !== null) {
      const html = this.pending;
      this.pending = null;
      this.replace(element, html);
      this.decorate(element, {
        canWrite: this.canWrite(),
        phrases: this.phrasePaths(),
        freeBlocks: this.freeBlockIds(),
        label: this.zoneLabel(),
        values: this.values(),
      });
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (this.variableZoneAt(event) !== null) {
      event.preventDefault();
      if (event.dataTransfer !== null) {
        event.dataTransfer.dropEffect = 'copy';
      }
    }
  }

  /**
   * Une valeur glissée sur une phrase qui la reçoit s'y pose en pastille, au
   * point de dépôt ; sur une autre, le dépôt est refusé et le mot du refus
   * remonte.
   */
  protected onDrop(event: DragEvent): void {
    const zone = this.variableZoneAt(event);
    const name = event.dataTransfer?.getData(VARIABLE_DRAG_TYPE) ?? '';
    if (zone === null || name === '') {
      return;
    }
    event.preventDefault();
    const refusal = valueRefusal(this.values(), name, zone.getAttribute('data-phrase') ?? '');
    if (refusal !== null) {
      this.valueRefused.emit(refusal);
      return;
    }
    const range = this.rangeAt(event.clientX, event.clientY, zone);
    const chip = variableChip(zone.ownerDocument, name);
    insertChipAt(range, chip);
    labelValueChip(chip, this.values());
    this.emitZone(zone);
  }

  private variableZoneAt(event: DragEvent): Element | null {
    const types = event.dataTransfer?.types ?? [];
    if (![...types].includes(VARIABLE_DRAG_TYPE) || !(event.target instanceof Element)) {
      return null;
    }
    return event.target.closest(PHRASE_ZONE);
  }

  /** Le point de dépôt dans la zone ; hors d'elle, sa fin. */
  private rangeAt(x: number, y: number, zone: Element): Range {
    const document = zone.ownerDocument;
    const range = document.caretRangeFromPoint?.(x, y) ?? null;
    if (range !== null && zone.contains(range.startContainer)) {
      return range;
    }
    const end = document.createRange();
    end.selectNodeContents(zone);
    end.collapse(false);
    return end;
  }

  private emitZone(zone: Element): void {
    const text = readDictionaryText(zone);
    const path = zone.getAttribute('data-phrase');
    if (path !== null) {
      this.phraseInput.emit({ path, text });
      return;
    }
    const blockId = zone.getAttribute('data-free-block');
    const locale = zone.getAttribute('data-locale');
    if (blockId !== null && locale !== null) {
      this.freeBlockInput.emit({ blockId, locale, text });
    }
  }

  private holdsFocus(element: HTMLElement): boolean {
    const active = element.ownerDocument.activeElement;
    return active !== null && active !== element && element.contains(active);
  }

  private replace(element: HTMLElement, html: string): void {
    // Le HTML vient de NOTRE API, échappé par elle, et vient de passer
    // `isSafeMailFragment` : rien de tiers n'y est ajouté (§ 22).
    element.innerHTML = html;
    this.applied = html;
  }

  private decorate(
    element: HTMLElement,
    options: {
      readonly canWrite: boolean;
      readonly phrases: ReadonlySet<string>;
      readonly freeBlocks: ReadonlySet<string>;
      readonly label: string;
      readonly values: ReadonlyMap<string, MailValueResource>;
    },
  ): void {
    // Le cadrage d'une image, en CSS : l'aperçu montre la source, le serveur
    // recadre à la publication (§ 19, « Format et point focal »).
    for (const image of element.querySelectorAll<HTMLImageElement>('img[data-image-format]')) {
      const framing = imageFramingStyle(
        image.getAttribute('data-image-format'),
        image.getAttribute('data-image-focal-x'),
        image.getAttribute('data-image-focal-y'),
      );
      if (framing !== null) {
        image.style.aspectRatio = framing.aspectRatio;
        image.style.objectFit = 'cover';
        image.style.objectPosition = framing.objectPosition;
        image.style.height = 'auto';
      }
    }
    // Une image pleine largeur porte la largeur intérieure de la carte d'envoi
    // (558 px) en plafond ; la carte du canevas est un peu plus large, et
    // l'image doit en toucher les deux bords comme dans l'e-mail.
    for (const image of element.querySelectorAll<HTMLImageElement>(
      'img[data-image-width="full"]',
    )) {
      image.style.maxWidth = '100%';
    }
    for (const chip of element.querySelectorAll('[data-var]')) {
      chip.setAttribute('contenteditable', 'false');
      labelValueChip(chip, options.values);
    }
    for (const zone of element.querySelectorAll('[data-phrase], [data-free-block]')) {
      const phrase = zone.getAttribute('data-phrase');
      const block = zone.getAttribute('data-free-block');
      const known =
        (phrase !== null && options.phrases.has(phrase)) ||
        (block !== null && options.freeBlocks.has(block));
      if (options.canWrite && known) {
        zone.setAttribute('contenteditable', 'plaintext-only');
        zone.setAttribute('role', 'textbox');
        zone.setAttribute('aria-label', zone.getAttribute('data-variant') ?? options.label);
      } else {
        zone.removeAttribute('contenteditable');
        zone.removeAttribute('role');
        zone.removeAttribute('aria-label');
      }
    }
  }
}
