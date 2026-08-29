import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { formatEuro } from '../../cart-total';
import { ClientCopyService } from '../../copy/client-copy.service';
import type { TrackedOrder } from '../../mock-orders';

/**
 * Une commande VIVANTE, comme objet.
 *
 * Le mode de service décide de tout ce qui change : la teinte de l'en-tête, et
 * le pied de carte. Les deux pieds ont la MÊME anatomie — une carte dans la
 * carte, dont la première rangée dit *où* ou *qui* avec son recours en mineur,
 * et la seconde porte l'action pleine largeur. C'est ce qui permet aux deux
 * cartes d'avoir la même hauteur sans qu'aucune hauteur ne soit écrite :
 * `margin-top:auto` sur le pied, et le défilement qui étire.
 *
 * ⚠️ Presque rien ici n'est un composant fold, et ce n'est pas un oubli : fold
 * ferme sa palette derrière `:host(.primary|.warning|.danger|…)`, c'est-à-dire
 * derrière une SÉMANTIQUE. Or « retrait » et « coursier » sont un mode de
 * service, pas une sémantique — un coursier n'est pas un avertissement. Tant
 * que fold n'ouvre pas de crochet de teinte, l'en-tête, les pastilles et les
 * boutons de cette carte restent à nous.
 *
 * Le stepper suit la surface et non un point de rupture arbitraire : vertical
 * là où la carte est étroite — c'est la timeline du téléphone —, horizontal dès
 * qu'elle a la largeur. Les trois états sont les mêmes des deux côtés : passé en
 * `primary` avec sa coche, présent en accent, avenir en pastille vide bordée.
 */
@Component({
  selector: 'app-track-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  host: { '[attr.data-mode]': 'order().mode' },
  templateUrl: './track-card.html',
  styleUrl: './track-card.scss',
})
export class TrackCard {
  readonly order = input.required<TrackedOrder>();

  /** Le QR de retrait — la maquette n'en a pas encore le modèle. */
  readonly qrAsked = output<void>();

  protected readonly t = inject(ClientCopyService).t;

  protected readonly total = computed(() => formatEuro(this.order().total));

  /** L'avancement, dit pour ceux qui n'ont pas la barre sous les yeux. */
  protected readonly progressLabel = computed(() =>
    this.t().orders.progress.replace('{n}', String(this.order().percent)),
  );

  /**
   * Les étapes, chacune sachant où elle se situe.
   *
   * Le calcul vit ici et pas dans la donnée : `at` dit l'étape courante, et
   * c'est la seule chose qu'un serveur aura à envoyer. Dériver « fait / en
   * cours / à venir » de ce seul nombre garantit qu'ils ne peuvent pas se
   * contredire.
   */
  protected readonly steps = computed(() => {
    const { steps, at } = this.order();
    return steps.map((step, index) => ({
      ...step,
      done: index < at,
      current: index === at,
      /** Le filet qui relie — la dernière étape n'a rien après elle. */
      linked: index < steps.length - 1,
    }));
  });

  /** Ce que dit l'encart du coursier : son prénom, ou l'attente honnête. */
  protected readonly courierLine = computed(() => {
    const name = this.order().courier;
    const copy = this.t().orders;
    return name === null ? copy.courierPending : copy.courierOnWay.replace('{name}', name);
  });
}
