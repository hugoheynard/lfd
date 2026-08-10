import type { FulfillmentMethod, OrderStatus, OrderView, PaymentStatus } from '@lfd/contracts';
import type { FoldIconName, FoldTimelineNode } from 'fold-ng';

/**
 * La **frise d'avancement** d'une commande : un rail unique, règlement d'abord,
 * puis production jusqu'à la remise.
 *
 * Deux choses la font varier, et ce sont les deux questions que pose le client
 * au téléphone :
 *
 * 1. **le régime de règlement** — payer par carte au checkout (`per_order`) et
 *    être facturé au terme (net60/net90/mensuel) ne racontent pas la même
 *    histoire. Un règlement en attente **bloque** : la commande est reçue, mais
 *    rien ne part en production tant que la carte n'a pas répondu. Un terme
 *    différé, au contraire, ne bloque rien — la facture viendra après ;
 * 2. **l'acheminement** — un retrait passe par « prête au retrait », une
 *    livraison par « confiée au coursier » puis « en livraison ». Ce ne sont pas
 *    les mêmes jalons, et les afficher tous rendrait la moitié de la frise
 *    inapplicable.
 *
 * ## Ce que la frise ne sait pas encore
 *
 * `OrderStatus` s'arrête à `fulfilled` : **aucune colonne ne suit** la remise au
 * coursier ni la mise à disposition en boutique. Ces jalons sont donc affichés —
 * ils décrivent le parcours réel — mais marqués `tracked: false` : ils
 * s'allument en bloc à la remise, et ne deviennent jamais l'étape courante. La
 * frise montre le chemin sans prétendre savoir où on en est dessus. Le jour où
 * ces états existent en base, seul `tracked` change.
 */

/** État d'une étape de la frise. */
export type StepState = 'done' | 'current' | 'upcoming' | 'failed';

/** Une étape de la frise d'avancement d'une commande. */
export interface TimelineStep {
  readonly key: string;
  readonly label: string;
  readonly state: StepState;
  readonly icon: FoldIconName;
  /**
   * Vrai quand l'état vient d'une **vraie** colonne. Faux pour les jalons de
   * transport, qu'aucun champ ne suit : ils s'allument à la remise et ne sont
   * jamais « courants ». Un consommateur peut les nuancer visuellement.
   */
  readonly tracked: boolean;
}

/** Rang d'avancement de production (aligné sur l'enum `OrderStatus`). */
const STATUS_RANK: Readonly<Record<OrderStatus, number>> = {
  draft: 0,
  placed: 1,
  confirmed: 2,
  in_production: 3,
  fulfilled: 4,
  cancelled: -1,
};

/** Le rang de la remise — celui auquel les jalons non suivis s'allument. */
const FULFILLED_RANK = 4;

/** Une étape de production déclarée : son rang, ou `null` si rien ne la suit. */
interface StepSpec {
  readonly key: string;
  readonly label: string;
  readonly icon: FoldIconName;
  /** `null` = jalon affiché mais non suivi (voir la note du module). */
  readonly rank: number | null;
}

/** Le tronc commun : de la réception à la sortie du four. */
const COMMON_STEPS: readonly StepSpec[] = [
  { key: 'placed', label: 'Commande reçue', icon: 'basket', rank: 1 },
  { key: 'confirmed', label: 'Confirmée', icon: 'check-circle', rank: 2 },
  { key: 'in_production', label: 'En préparation', icon: 'fire', rank: 3 },
];

/** La queue de la frise, propre à l'acheminement choisi. */
const TAIL_STEPS: Readonly<Record<FulfillmentMethod, readonly StepSpec[]>> = {
  pickup: [
    { key: 'ready', label: 'Prête au retrait', icon: 'store', rank: null },
    { key: 'fulfilled', label: 'Retirée', icon: 'package-check', rank: FULFILLED_RANK },
  ],
  delivery: [
    { key: 'handover', label: 'Confiée au coursier', icon: 'package', rank: null },
    { key: 'transit', label: 'En livraison', icon: 'truck', rank: null },
    { key: 'fulfilled', label: 'Livrée', icon: 'package-check', rank: FULFILLED_RANK },
  ],
};

/** L'étape de règlement, telle que le régime de la commande la raconte. */
const PAYMENT_STEPS: Readonly<
  Record<PaymentStatus, { label: string; icon: FoldIconName; state: StepState }>
> = {
  // Facturée au terme : rien n'est encaissé au checkout, et rien n'attend.
  // L'étape est acquise du point de vue du parcours — le badge d'en-tête, lui,
  // dit toujours « À facturer ».
  not_required: { label: 'Facturée au terme', icon: 'receipt', state: 'done' },
  pending: { label: 'Paiement en attente', icon: 'clock', state: 'current' },
  paid: { label: 'Payée', icon: 'credit-card', state: 'done' },
  failed: { label: 'Paiement échoué', icon: 'x-circle', state: 'failed' },
  refunded: { label: 'Remboursée', icon: 'undo', state: 'failed' },
};

/**
 * Un règlement qui **bloque** la suite : carte en attente ou refusée. Tant qu'il
 * bloque, aucune étape de production n'est « courante » — la commande est reçue,
 * mais elle ne bouge pas, et une frise qui laisserait clignoter « en préparation »
 * promettrait un four qui ne tourne pas.
 */
function blocksProduction(status: PaymentStatus): boolean {
  return status === 'pending' || status === 'failed';
}

/** L'état d'une étape de production, connaissant le rang atteint. */
function stateOf(spec: StepSpec, rank: number, blocked: boolean): StepState {
  if (spec.rank === null) {
    // Jalon non suivi : allumé à la remise, jamais courant.
    return rank >= FULFILLED_RANK ? 'done' : 'upcoming';
  }
  if (rank > spec.rank) {
    return 'done';
  }
  if (rank === spec.rank) {
    return blocked ? 'done' : 'current';
  }
  return 'upcoming';
}

/**
 * La frise d'une commande, dérivée de ses seuls vrais champs (`status`,
 * `paymentStatus`, `fulfillmentMethod`) — aucune invention.
 */
export function buildTimeline(order: OrderView): readonly TimelineStep[] {
  const pay = PAYMENT_STEPS[order.paymentStatus];
  const payment: TimelineStep = { key: 'payment', ...pay, tracked: true };

  if (order.status === 'cancelled') {
    return [
      payment,
      {
        key: 'cancelled',
        label: 'Commande annulée',
        icon: 'x-circle',
        state: 'failed',
        tracked: true,
      },
    ];
  }

  const rank = STATUS_RANK[order.status];
  const blocked = blocksProduction(order.paymentStatus);
  const specs = [...COMMON_STEPS, ...TAIL_STEPS[order.fulfillmentMethod]];

  return [
    payment,
    ...specs.map<TimelineStep>((spec) => ({
      key: spec.key,
      label: spec.label,
      icon: spec.icon,
      state: stateOf(spec, rank, blocked),
      tracked: spec.rank !== null,
    })),
  ];
}

/**
 * Les étapes → des nœuds `fold-timeline`. Un seul mappage pour tous les
 * consommateurs : la liste et la page de détail ne doivent pas pouvoir diverger
 * sur ce qu'est une étape « faite ».
 *
 * `done` porte l'accent du rail : acquis **et** courant, parce qu'un rail qui
 * s'arrêterait avant l'étape en cours laisserait croire qu'elle n'a pas commencé.
 * L'échec, lui, n'est pas `done` — c'est le template projeté qui le colore, le
 * composant fold n'ayant pas de ton par nœud.
 */
export function toTimelineNodes(steps: readonly TimelineStep[]): readonly FoldTimelineNode[] {
  return steps.map((step) => ({
    key: step.key,
    id: null,
    clickable: false,
    label: step.label,
    icon: step.icon,
    done: step.state === 'done' || step.state === 'current',
    variant: step.state === 'current' ? 'hollow' : 'plain',
    // Un jalon non suivi et pas encore atteint se dit `untracked` : le rendu le
    // met en retrait, parce qu'on affiche le chemin sans savoir où on en est
    // dessus. Une fois la commande remise, il est fait comme les autres.
    state: step.tracked || step.state === 'done' ? step.state : 'untracked',
  }));
}

/** Le règlement est encore à faire (terme non réglé ou carte en attente). */
export function canSettle(status: PaymentStatus): boolean {
  return status === 'not_required' || status === 'pending';
}
