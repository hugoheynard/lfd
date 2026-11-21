import { afterNextRender, effect, ElementRef, inject, Injector, type Signal } from '@angular/core';

/**
 * **Amène la ligne du lien sous les yeux, une seule fois**, dès qu'elle est
 * rendue dans l'écran appelant (`[data-line="<sku>"]`).
 *
 * Une lecture de la page, pas un état : la relecture périodique de la fiche
 * ne la refait pas, et la personne qui a défilé ailleurs n'est pas ramenée.
 *
 * ⚠️ À appeler dans un contexte d'injection (constructeur).
 *
 * @param sku La ligne à montrer ; `null` tant qu'aucune n'est désignée.
 * @param ready Vrai quand la fiche qui la porte est connue.
 */
export function revealLineOnce(sku: Signal<string | null>, ready: Signal<boolean>): void {
  const host = inject<ElementRef<HTMLElement>>(ElementRef);
  const injector = inject(Injector);
  let shown = false;
  effect(() => {
    const wanted = sku();
    if (shown || wanted === null || !ready()) {
      return;
    }
    shown = true;
    afterNextRender(
      () => {
        const lines = host.nativeElement.querySelectorAll<HTMLElement>('[data-line]');
        const element = [...lines].find((line) => line.dataset['line'] === wanted);
        // jsdom n'a pas `scrollIntoView` : la garde vaut pour les tests seulement.
        if (element !== undefined && 'scrollIntoView' in element) {
          element.scrollIntoView({ block: 'center' });
        }
      },
      { injector },
    );
  });
}
