import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

/** Un écran tactile : là seulement, un champ qui prend le focus ouvre un clavier à l'écran. */
const TOUCH_QUERY = '(pointer: coarse)';

/** Les `<input>` qui n'ouvrent pas de clavier : on les coche, on les clique. */
const NO_KEYBOARD_INPUTS: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** Ce champ ouvre-t-il le clavier de l'appareil quand il prend le focus ? */
export function opensSoftKeyboard(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target instanceof HTMLTextAreaElement) {
    return !target.readOnly && !target.disabled;
  }
  if (target instanceof HTMLInputElement) {
    return !NO_KEYBOARD_INPUTS.has(target.type) && !target.readOnly && !target.disabled;
  }
  // `=== true` : jsdom et quelques moteurs rendent `undefined` hors édition.
  return target.isContentEditable === true;
}

/**
 * **Le clavier de l'appareil est-il ouvert ?** — lu au focus, faute d'événement
 * qui le dise sur tous les navigateurs.
 *
 * Hugo, 2026-10-29 : sur un téléphone, la barre du panier, collée en bas, monte
 * avec le clavier et couvre le champ qu'on remplit. Elle s'efface pendant la
 * saisie et revient quand le champ perd le focus. Le focus est le seul signal
 * commun : `visualViewport` change aussi au zoom et au défilement de la barre
 * d'adresse, et confondrait les deux.
 *
 * Toujours faux côté serveur et sur un écran à souris : un clavier physique ne
 * couvre rien.
 */
@Injectable({ providedIn: 'root' })
export class SoftKeyboard {
  private readonly typing = signal(false);

  /** Vrai pendant qu'un champ à clavier a le focus, sur un écran tactile. */
  readonly open = this.typing.asReadonly();

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }
    const document = inject(DOCUMENT);
    const view = document.defaultView;
    // `matchMedia` manque à jsdom et à quelques webviews : sans lui, pas de clavier à suivre.
    if (
      view === null ||
      typeof view.matchMedia !== 'function' ||
      !view.matchMedia(TOUCH_QUERY).matches
    ) {
      return;
    }
    const onFocusIn = (event: FocusEvent): void => this.typing.set(opensSoftKeyboard(event.target));
    // Le focus qui passe d'un champ au suivant émet `focusout` puis `focusin` :
    // on ne relit qu'APRÈS, sans quoi la barre clignoterait entre deux champs.
    const onFocusOut = (): void => {
      view.setTimeout(() => this.typing.set(opensSoftKeyboard(document.activeElement)), 0);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    });
  }
}
