import { Directive, inject, type Signal, TemplateRef, type WritableSignal } from '@angular/core';

import type { PhotoCardDraft } from './photo-card-draft.model';

/** Ce que l'éditeur confie au formulaire qu'on lui projette. */
export interface PhotoCardFormState {
  /** Le brouillon, à lier en `[(value)]`. */
  readonly draft: WritableSignal<PhotoCardDraft>;
  /** L'image de la photo enregistrée de la carte refaite, ou `null`. */
  readonly currentPhotoUrl: Signal<string | null>;
}

export interface PhotoCardFormContext {
  readonly $implicit: PhotoCardFormState;
}

/**
 * La place du **formulaire** dans `lfd-photo-cards-editor` :
 * `<ng-template lfdPhotoCardForm let-form>`.
 *
 * Projeté plutôt que posé par l'éditeur, parce que le formulaire est celui de
 * l'usage : la procédure de livraison monte `lfd-delivery-step-form`, que ses
 * consommateurs et leurs tests connaissent sous ce nom. L'éditeur ne décide
 * que du moment où il paraît.
 */
@Directive({ selector: 'ng-template[lfdPhotoCardForm]' })
export class PhotoCardFormSlot {
  readonly template = inject<TemplateRef<PhotoCardFormContext>>(TemplateRef);

  /** Apprend au vérificateur de gabarits ce qu'est `let-form`. */
  static ngTemplateContextGuard(
    _slot: PhotoCardFormSlot,
    context: unknown,
  ): context is PhotoCardFormContext {
    // Seule la signature sert au vérificateur ; à l'exécution, l'éditeur est le seul à fournir ce contexte.
    return typeof context === 'object' && context !== null;
  }
}
