import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { B2bProductDeliveryView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldLoadingStateComponent,
  FoldTimelineComponent,
  type FoldTimelineNode,
} from 'fold-ng';

import { B2bChannelApi } from '../../../channels/b2b-channel-api';

/**
 * Avec l'heure, comme la signature du rail : deux pushes dans la même journée
 * sont le cas courant, et une date seule ne dirait pas lequel a précédé l'autre.
 */
const QUAND = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

const quand = (iso: string | null): string | null =>
  iso === null ? null : QUAND.format(new Date(iso));

/**
 * Un nœud de frise, la date **omise** quand il n'y en a pas.
 *
 * `exactOptionalPropertyTypes` distingue « absente » de « présente et
 * indéfinie », et fold ne déclare que la première. Poser `displayDate:
 * undefined` ne compilerait pas — et c'est tant mieux : une date vide et une
 * date absente ne se peignent pas pareil.
 */
function node(input: {
  readonly key: string;
  readonly label: string;
  readonly at: string | null;
  readonly done: boolean;
}): FoldTimelineNode {
  const shown = quand(input.at);
  return {
    key: input.key,
    id: null,
    label: input.label,
    done: input.done,
    ...(shown === null ? {} : { displayDate: shown }),
  };
}

/**
 * **La frise : la décision, l'envoi, l'acceptation.**
 *
 * Le rail savait dire « publiée au catalogue » et « publiée au canal ». Il ne
 * savait pas dire si la plateforme avait **accepté** — et c'est là que le fil se
 * rompt sans bruit : une fiche publiée, poussée, écartée à la projection faute
 * de prix, s'affichait exactement comme une fiche en vente. L'audit du
 * 2026-09-01 le relevait déjà ; il manquait le fait de l'autre côté.
 *
 * Les trois dates viennent de trois endroits, et c'est tout le sujet :
 * `publishedAt` est une décision du référentiel, `lastPushedAt` un acte
 * technique qui peut échouer ou traîner, `factsReceivedAt` un fait que seule la
 * plateforme peut donner — par un port, jamais par une lecture de ses tables.
 *
 * ⚠️ **Un bloc qui ne bloque rien.** Il n'empêche aucune publication et ne
 * refuse rien : il dit ce qui est. Une frise qui interdirait de publier
 * transformerait une information en garde, et il faudrait alors la contourner
 * le jour où la plateforme est indisponible.
 */
@Component({
  selector: 'app-b2b-delivery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldLoadingStateComponent,
    FoldTimelineComponent,
  ],
  templateUrl: './b2b-delivery.html',
  styleUrl: './b2b-delivery.scss',
})
export class B2bDelivery {
  private readonly channel = inject(B2bChannelApi);

  readonly productId = input.required<string>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly frise = signal<B2bProductDeliveryView | null>(null);

  constructor() {
    // Rechargée quand la fiche change : le rail vit dans une page routée qu'on
    // réutilise d'un produit à l'autre, et une frise qui resterait sur la
    // précédente serait pire que pas de frise du tout.
    effect(() => {
      const id = this.productId();
      if (id !== '') {
        void this.load(id);
      }
    });
  }

  /** Les déclinaisons que la plateforme dit tenir. */
  private readonly accepted = computed(() =>
    (this.frise()?.variants ?? []).filter((variant) => variant.accepted),
  );

  /** La plus ancienne arrivée non validée qui touche cette fiche. */
  protected readonly awaitingSince = computed(() => {
    const dates = (this.frise()?.variants ?? [])
      .map((variant) => variant.awaitingSince)
      .filter((since): since is string => since !== null)
      .sort();
    return dates[0] === undefined ? null : quand(dates[0]);
  });

  /**
   * 🔴 Poussée, et la plateforme ne l'a pas : l'anomalie que rien ne disait.
   *
   * Le cas courant n'est pas une panne — c'est un article **écarté à la
   * projection**, faute de prix ou de taux professionnel. Le push répond `201`,
   * la fiche paraît partie, et elle n'est en vente nulle part. On ne l'affiche
   * pas quand une arrivée attend : là, l'absence est normale et expliquée.
   */
  protected readonly pushedButAbsent = computed(() => {
    const view = this.frise();
    if (view === null || view.lastPushedAt === null || this.awaitingSince() !== null) {
      return false;
    }
    return this.accepted().length < view.variants.length;
  });

  protected readonly nodes = computed<readonly FoldTimelineNode[]>(() => {
    const view = this.frise();
    if (view === null) {
      return [];
    }
    const total = view.variants.length;
    const held = this.accepted().length;
    return [
      node({
        key: 'canal',
        label:
          view.publishedAt === null
            ? 'Pas vendue aux professionnels'
            : 'Publiée au canal professionnel',
        at: view.publishedAt,
        done: view.publishedAt !== null,
      }),
      node({
        key: 'push',
        label: view.lastPushedAt === null ? 'Jamais poussée' : 'Poussée vers la plateforme',
        at: view.lastPushedAt,
        done: view.lastPushedAt !== null,
      }),
      node({
        key: 'acceptee',
        label: this.acceptanceLabel(held, total),
        // La date n'est portée que si TOUTES les déclinaisons partagent la
        // même : deux dates différentes n'ont pas de résumé honnête, et en
        // choisir une ferait dire à la frise ce qu'elle ne sait pas.
        at: sharedFactsDate(view),
        done: held === total && total > 0,
      }),
    ];
  });

  private acceptanceLabel(held: number, total: number): string {
    if (total === 0) {
      return 'Aucune déclinaison à livrer';
    }
    if (held === 0) {
      return "La plateforme ne l'a pas";
    }
    return held === total
      ? 'Acceptée — faits en vigueur'
      : `Acceptée en partie — ${held} déclinaison${held > 1 ? 's' : ''} sur ${total}`;
  }

  protected async load(id: string): Promise<void> {
    this.state.set('loading');
    try {
      this.frise.set(await this.channel.delivery(id));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected reload(): void {
    void this.load(this.productId());
  }
}

/** La date des faits quand toutes les déclinaisons acceptées la partagent. */
function sharedFactsDate(view: B2bProductDeliveryView): string | null {
  const dates = new Set(
    view.variants
      .map((variant) => variant.factsReceivedAt)
      .filter((at): at is string => at !== null),
  );
  return dates.size === 1 ? ([...dates][0] ?? null) : null;
}
