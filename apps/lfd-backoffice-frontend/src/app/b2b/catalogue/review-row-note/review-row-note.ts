import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import type { ShopAudience } from '../catalogue.service';

/** Le bouton d'une audience seule, dans les mots du staff. */
const APPROVE_LABEL: Readonly<Record<ShopAudience, string>> = {
  pro: 'Valider pour les pros',
  public: 'Valider pour la boutique',
};

/** Le choix secondaire, quand l'article attend les deux. */
const ONLY_LABEL: Readonly<Record<ShopAudience, string>> = {
  pro: 'Seulement les pros',
  public: 'Seulement la boutique',
};

/** Ce qu'attend l'article, en une phrase. */
const WAITING_LABEL: Readonly<Record<ShopAudience, string>> = {
  pro: 'les pros',
  public: 'la boutique',
};

/**
 * **La validation d'une arrivée, sous sa ligne** — la note `foldRowNote` du
 * rayon (Hugo, 2026-10-17 : la validation passe DANS la table).
 *
 * Pros et boutique restent deux décisions (Hugo, 2026-10-15, option 2,
 * conservée) ; l'écran ne montre que les boutons utiles. Une audience
 * attendue : un seul bouton, qui la nomme. Les deux : « Valider » lève les
 * deux d'un geste — le cas courant —, et un menu garde le choix d'une seule.
 * Le serveur ignore une audience qui n'attendait rien, sans refus.
 */
@Component({
  selector: 'app-review-row-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './review-row-note.html',
})
export class ReviewRowNote {
  /** Le nom de l'article — pour les libellés accessibles. */
  readonly name = input.required<string>();
  /** Les audiences qui l'attendent, jamais vide. */
  readonly audiences = input.required<readonly ShopAudience[]>();
  readonly busy = input(false);

  readonly approve = output<readonly ShopAudience[]>();

  /** L'audience seule attendue, ou `null` quand il en attend deux. */
  protected readonly single = computed<ShopAudience | null>(() => {
    const audiences = this.audiences();
    return audiences.length === 1 ? (audiences[0] ?? null) : null;
  });

  protected readonly message = computed(() => {
    const names = this.audiences().map((audience) => WAITING_LABEL[audience]);
    return `Nouvel article : en attente de validation pour ${names.join(' et ')}.`;
  });

  protected approveLabel(audience: ShopAudience): string {
    return APPROVE_LABEL[audience];
  }

  protected onlyLabel(audience: ShopAudience): string {
    return ONLY_LABEL[audience];
  }
}
