import { afterEveryRender, Directive, ElementRef, inject } from '@angular/core';

/** Les touches du motif « groupe de boutons radio » et le pas qu'elles font. */
const STEPS: Readonly<Record<string, 'next' | 'previous' | 'first' | 'last'>> = {
  ArrowDown: 'next',
  ArrowRight: 'next',
  ArrowUp: 'previous',
  ArrowLeft: 'previous',
  Home: 'first',
  End: 'last',
};

/**
 * **Le clavier d'un groupe de boutons radio maison** (RGAA 7.1 et 12.8, lot A2).
 *
 * Les choix riches du parcours — une maison, une adresse, un créneau, un
 * jour — sont des `button role="radio"` dans un `role="radiogroup"` : leur
 * rangée porte un nom, une adresse, un tarif, ce que `fold-view-toggle` (le
 * seul groupe radio de fold, vérifié dans `fold-ng.d.ts` 0.34.0 le
 * 2026-10-26) ne sait pas rendre — ses segments ne portent qu'un libellé et
 * une icône. Le rôle était juste ; le clavier, lui, manquait : chaque radio
 * était un arrêt de tabulation, et les flèches ne faisaient rien.
 *
 * Posée sur le groupe, la directive tient le motif ARIA attendu :
 * - **un seul arrêt** — la radio cochée, ou la première active s'il n'y en a
 *   pas (« tabindex itinérant ») ;
 * - **les flèches** passent à la suivante ou à la précédente, en boucle, et la
 *   sélection SUIT le focus ; Début et Fin vont aux extrémités.
 *
 * Elle choisit en CLIQUANT la radio atteinte : le gestionnaire de l'écran reste
 * la seule porte de la sélection, et une radio qui refuse (un créneau complet,
 * désactivé) n'est jamais atteinte.
 */
@Directive({
  selector: '[appRovingRadioGroup]',
  host: { '(keydown)': 'onKeydown($event)' },
})
export class RovingRadioGroup {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterEveryRender(() => this.placeTabStop());
  }

  /** Les radios atteignables, dans l'ordre du document. */
  private radios(): HTMLElement[] {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('[role="radio"]'),
    ).filter((radio) => !radio.hasAttribute('disabled'));
  }

  private placeTabStop(): void {
    const radios = this.radios();
    this.holdTabStop(
      radios.find((radio) => radio.getAttribute('aria-checked') === 'true') ?? radios[0],
    );
  }

  private holdTabStop(stop: HTMLElement | undefined): void {
    for (const radio of this.host.nativeElement.querySelectorAll<HTMLElement>('[role="radio"]')) {
      radio.tabIndex = radio === stop ? 0 : -1;
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const step = STEPS[event.key];
    const radios = this.radios();
    const from = radios.findIndex((radio) => radio === event.target);
    if (step === undefined || from === -1) {
      return;
    }
    event.preventDefault();
    const last = radios.length - 1;
    const to =
      step === 'first'
        ? 0
        : step === 'last'
          ? last
          : step === 'next'
            ? (from + 1) % radios.length
            : (from - 1 + radios.length) % radios.length;
    const target = radios[to];
    // L'arrêt suit le focus tout de suite ; le rendu qui suit le confirmera
    // d'après `aria-checked`.
    this.holdTabStop(target);
    target?.focus();
    target?.click();
  }
}
