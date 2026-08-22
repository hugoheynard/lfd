import { signal, type Signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';

/**
 * Pourquoi une liste est vide.
 *
 * ## Le défaut que ça corrige
 *
 * Les stores chargeaient en « best-effort » : `void this.reload().catch(() =>
 * undefined)`. Un backend injoignable laissait donc la liste vide — et l'écran
 * affichait « Aucun emplacement, créez-en un », mot pour mot ce qu'il affiche
 * quand il n'y en a réellement aucun.
 *
 * Les deux états sont pourtant opposés : dans l'un il n'y a rien à faire, dans
 * l'autre on invite quelqu'un à **recréer ce qui existe déjà**. Un affichage
 * qui ment avec l'aplomb d'un fait est pire qu'une erreur brute.
 *
 * ## Ce que ça n'est pas
 *
 * Pas un état de chargement : la liste part vide et se remplit, et une
 * bannière « chargement » sur une liste qui arrive en 40 ms clignote pour rien.
 * Seul l'ÉCHEC change le sens de la page, donc seul l'échec est retenu.
 */
export class ListLoadState {
  private readonly failure = signal<string | null>(null);

  /**
   * Le message du dernier échec de chargement, ou `null` si la dernière lecture
   * a abouti. Une liste vide **avec** ce message n'est pas une liste vide.
   */
  readonly error: Signal<string | null> = this.failure.asReadonly();

  /**
   * Joue un chargement en retenant son échec.
   *
   * **Relance quand même.** L'appelant qui attend le résultat — une mutation
   * qui recharge derrière elle — doit continuer de voir le refus ; seul le
   * chargement automatique du démarrage l'absorbe, et il le fait sciemment.
   */
  async run<T>(load: () => Promise<T>, apply: (value: T) => void): Promise<void> {
    try {
      apply(await load());
      this.failure.set(null);
    } catch (caught) {
      this.failure.set(httpErrorMessage(caught, 'Le service est injoignable.'));
      throw caught;
    }
  }
}
