import { inject, signal, type Signal } from '@angular/core';
import { FoldPanelRef } from 'fold-ng';

import { LFD_NOTIFY } from './notify';

/** L'état d'une soumission de panneau, et le geste qui la lance. */
export interface PanelSubmit {
  /** Vrai tant que l'appel est en vol — de quoi désarmer le bouton. */
  readonly pending: Signal<boolean>;
  /**
   * Lance l'enregistrement, annonce le résultat, ferme si ça a marché.
   * Rend `true` en cas de succès — le panneau n'a rien à réenchaîner, mais un
   * appelant qui veut savoir n'a pas à ré-observer `pending`.
   */
  run(work: () => Promise<unknown>, success: string): Promise<boolean>;
}

/**
 * La **chorégraphie d'enregistrement** d'un panneau : garder le double-clic,
 * attendre, annoncer, fermer avec un résultat vrai, et relâcher quoi qu'il
 * arrive.
 *
 * Elle est ici parce qu'elle a déjà divergé. Les deux panneaux d'adresse —
 * client et staff — faisaient le même geste, et un seul des deux gardait le
 * double-clic ; l'autre ne disait rien du tout quand l'enregistrement échouait,
 * si bien qu'une adresse refusée par le backend restait ouverte à l'écran,
 * apparemment intacte. Ce n'est pas une négligence isolée : c'est ce qui arrive
 * à deux copies d'un même geste, et la seule façon de ne pas le revivre au
 * prochain champ ajouté d'un côté est qu'il n'y ait plus qu'un geste.
 *
 * À appeler en **contexte d'injection** (initialiseur de champ), comme
 * `toSignal` : elle réclame le `FoldPanelRef` du panneau et le port de retour
 * d'opération de l'app.
 */
export function panelSubmit(): PanelSubmit {
  const ref = inject(FoldPanelRef<boolean>);
  const notify = inject(LFD_NOTIFY);
  const pending = signal(false);

  return {
    pending: pending.asReadonly(),
    async run(work: () => Promise<unknown>, success: string): Promise<boolean> {
      if (pending()) {
        return false;
      }
      pending.set(true);
      try {
        await work();
        notify.success(success);
        ref.close(true);
        return true;
      } catch (error) {
        // Le panneau RESTE ouvert : la saisie est encore là, et la corriger
        // vaut mieux que la retaper.
        notify.error(error);
        return false;
      } finally {
        pending.set(false);
      }
    },
  };
}
