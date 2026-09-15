import { afterNextRender, DestroyRef, Directive, ElementRef, inject, output } from '@angular/core';

/**
 * Prévient **une fois** que l'élément entre à l'écran — ou s'en approche d'un
 * écran : la vignette est déjà là quand on y arrive en faisant défiler.
 *
 * C'est ce qui fait qu'un carnet de cinquante notes ne télécharge pas cinquante
 * vignettes à l'ouverture (plan « notes photo du commercial », D11).
 *
 * Sans `IntersectionObserver` (un banc de test, un navigateur très ancien), il
 * prévient tout de suite : mieux vaut tout charger que ne rien montrer.
 */
@Directive({ selector: '[lfdPhotoCardInView]' })
export class PhotoCardInView {
  readonly lfdPhotoCardInView = output();

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') {
        this.lfdPhotoCardInView.emit();
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            this.lfdPhotoCardInView.emit();
          }
        },
        { rootMargin: IN_VIEW_MARGIN },
      );
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}

/** Un demi-écran d'avance : la vignette arrive avant la carte, pas après. */
const IN_VIEW_MARGIN = '50% 0px';
