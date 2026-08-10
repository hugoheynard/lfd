import type { FulfillmentMethod, OrderStatus, OrderView, PaymentStatus } from '@lfd/contracts';
import type { FoldIconName, FoldTimelineNode } from 'fold-ng';

import { formatOrderDay, formatOrderInstant } from './order-format';

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
 * ## Deux publics, un seul parcours
 *
 * Le client et le commercial regardent **les mêmes étapes**, pas le même niveau
 * de détail. « Confirmée » suffit à rassurer un client ; le commercial, lui, a
 * besoin de savoir ce que ça veut dire dans l'atelier — « ajoutée au compte à
 * produire ». D'où un `detail` par étape, rendu au staff seulement.
 *
 * Ce n'est **pas** deux frises : les états, l'ordre et les règles sont partagés.
 * Quand le client appelle, le commercial voit son écran, augmenté — jamais un
 * autre écran.
 *
 * ## Ce que la frise ne sait pas encore
 *
 * `OrderStatus` s'arrête à `fulfilled` : **aucune colonne ne suit** la remise au
 * coursier ni la mise à disposition en boutique. Ces jalons sont donc affichés —
 * ils décrivent le parcours réel — mais marqués `tracked: false` : ils
 * s'allument en bloc à la remise, et ne deviennent jamais l'étape courante.
 *
 * Même honnêteté sur les **dates** : une seule est un fait (`placedAt`). Les
 * autres transitions n'ont pas d'horodatage en base — on n'en invente donc
 * aucune. Ce qui reste affichable est l'**échéance attendue**, dite comme telle
 * (« prévu le 12 août »), et seulement tant que l'étape n'est pas franchie.
 * Le jour où chaque transition portera son instant, seul {@link instantOf}
 * changera.
 */

/** À qui s'adresse la frise. Le staff voit un niveau de détail en plus. */
export type OrderAudience = 'client' | 'staff';

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
  /**
   * Ce que l'étape signifie côté atelier. Rendu au **staff seulement** — un
   * client n'a que faire du compte à produire.
   */
  readonly detail: string | null;
  /** L'instant réel, formaté, quand la base le connaît. */
  readonly at: string | null;
  /** L'échéance attendue, formatée. Effacée dès que l'étape est franchie. */
  readonly expectedAt: string | null;
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

/** D'où une étape tire sa date, quand elle en a une. */
type WhenSource = 'placed' | 'fulfillment' | null;

/** Une étape de production déclarée : son rang, ou `null` si rien ne la suit. */
interface StepSpec {
  readonly key: string;
  readonly label: string;
  readonly icon: FoldIconName;
  /** `null` = jalon affiché mais non suivi (voir la note du module). */
  readonly rank: number | null;
  /** Le sens opérationnel, pour le staff. */
  readonly detail: string;
  readonly when: WhenSource;
}

/** Le tronc commun : de la réception à la sortie du four. */
const COMMON_STEPS: readonly StepSpec[] = [
  {
    key: 'placed',
    label: 'Commande reçue',
    icon: 'basket',
    rank: 1,
    detail: 'enregistrée, en attente du plan du soir',
    when: 'placed',
  },
  {
    key: 'confirmed',
    label: 'Confirmée',
    icon: 'check-circle',
    rank: 2,
    detail: 'ajoutée au compte à produire',
    when: null,
  },
  {
    key: 'in_production',
    label: 'En préparation',
    icon: 'fire',
    rank: 3,
    detail: 'lot en cours au laboratoire',
    when: null,
  },
];

/** La queue de la frise, propre à l'acheminement choisi. */
const TAIL_STEPS: Readonly<Record<FulfillmentMethod, readonly StepSpec[]>> = {
  pickup: [
    {
      key: 'ready',
      label: 'Prête au retrait',
      icon: 'store',
      rank: null,
      detail: 'conditionnée, en attente du client',
      when: 'fulfillment',
    },
    {
      key: 'fulfilled',
      label: 'Retirée',
      icon: 'package-check',
      rank: FULFILLED_RANK,
      detail: 'remise au client',
      when: null,
    },
  ],
  delivery: [
    {
      key: 'handover',
      label: 'Confiée au coursier',
      icon: 'package',
      rank: null,
      detail: 'chargée dans une tournée',
      when: null,
    },
    {
      key: 'transit',
      label: 'En livraison',
      icon: 'truck',
      rank: null,
      detail: 'en tournée',
      when: null,
    },
    {
      key: 'fulfilled',
      label: 'Livrée',
      icon: 'package-check',
      rank: FULFILLED_RANK,
      detail: 'arrêt livré',
      when: 'fulfillment',
    },
  ],
};

/** L'étape de règlement, telle que le régime de la commande la raconte. */
const PAYMENT_STEPS: Readonly<
  Record<PaymentStatus, { label: string; icon: FoldIconName; state: StepState; detail: string }>
> = {
  // Facturée au terme : rien n'est encaissé au checkout, et rien n'attend.
  // L'étape est acquise du point de vue du parcours — le badge d'en-tête, lui,
  // dit toujours « À facturer ».
  not_required: {
    label: 'Facturée au terme',
    icon: 'receipt',
    state: 'done',
    detail: 'terme différé — rien à encaisser maintenant',
  },
  pending: {
    label: 'Paiement en attente',
    icon: 'clock',
    state: 'current',
    detail: 'bloque la mise en production',
  },
  paid: {
    label: 'Payée',
    icon: 'credit-card',
    state: 'done',
    detail: 'encaissée par carte au checkout',
  },
  failed: {
    label: 'Paiement échoué',
    icon: 'x-circle',
    state: 'failed',
    detail: 'bloque la mise en production',
  },
  refunded: { label: 'Remboursée', icon: 'undo', state: 'failed', detail: 'remboursement émis' },
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
 * L'instant réel d'une étape, ou `null`. Une seule transition est horodatée en
 * base aujourd'hui — la création. Le reste attend que le cycle de vie s'écrive
 * (cf. `documentation/b2b/architecture-cycle-de-vie-commande.md`).
 */
function instantOf(spec: StepSpec, order: OrderView): string | null {
  return spec.when === 'placed' ? formatOrderInstant(order.placedAt) : null;
}

/**
 * L'échéance attendue d'une étape, ou `null`.
 *
 * Rendue **uniquement sur une étape pas encore atteinte** (`upcoming`). On
 * n'annonce pas ce qui est en train d'arriver : « prévu le 12 août » sur le
 * jalon où l'on se tient est au mieux inutile, au pire faux — et c'est le cas de
 * la dernière étape, qui est `current` quand elle est atteinte, jamais `done`.
 */
function expectationOf(spec: StepSpec, order: OrderView, state: StepState): string | null {
  if (spec.when !== 'fulfillment' || state !== 'upcoming' || order.requestedDeliveryDate === null) {
    return null;
  }
  return `prévu le ${formatOrderDay(order.requestedDeliveryDate)}`;
}

/** Le détail opérationnel, si le public le demande. */
function detailFor(detail: string, audience: OrderAudience): string | null {
  return audience === 'staff' ? detail : null;
}

/**
 * La frise d'une commande, dérivée de ses seuls vrais champs (`status`,
 * `paymentStatus`, `fulfillmentMethod`, `placedAt`) — aucune invention.
 */
export function buildTimeline(
  order: OrderView,
  audience: OrderAudience = 'client',
): readonly TimelineStep[] {
  const pay = PAYMENT_STEPS[order.paymentStatus];
  const payment: TimelineStep = {
    key: 'payment',
    label: pay.label,
    icon: pay.icon,
    state: pay.state,
    tracked: true,
    detail: detailFor(pay.detail, audience),
    at: null,
    expectedAt: null,
  };

  if (order.status === 'cancelled') {
    return [
      payment,
      {
        key: 'cancelled',
        label: 'Commande annulée',
        icon: 'x-circle',
        state: 'failed',
        tracked: true,
        detail: detailFor('sortie du compte à produire', audience),
        at: null,
        expectedAt: null,
      },
    ];
  }

  const rank = STATUS_RANK[order.status];
  const blocked = blocksProduction(order.paymentStatus);
  const specs = [...COMMON_STEPS, ...TAIL_STEPS[order.fulfillmentMethod]];

  return [
    payment,
    ...specs.map<TimelineStep>((spec) => {
      const state = stateOf(spec, rank, blocked);
      return {
        key: spec.key,
        label: spec.label,
        icon: spec.icon,
        state,
        tracked: spec.rank !== null,
        detail: detailFor(spec.detail, audience),
        at: instantOf(spec, order),
        expectedAt: expectationOf(spec, order, state),
      };
    }),
  ];
}

/**
 * La date à afficher sous un jalon : le fait s'il existe, l'attente sinon.
 * Jamais les deux — un instant réel rend l'échéance sans objet.
 */
function displayDateOf(step: TimelineStep): string | null {
  return step.at ?? step.expectedAt;
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
  return steps.map((step) => {
    const date = displayDateOf(step);
    return {
      key: step.key,
      id: null,
      clickable: false,
      label: step.label,
      icon: step.icon,
      done: step.state === 'done' || step.state === 'current',
      variant: step.state === 'current' ? ('hollow' as const) : ('plain' as const),
      // Un jalon non suivi et pas encore atteint se dit `untracked` : le rendu le
      // met en retrait, parce qu'on affiche le chemin sans savoir où on en est
      // dessus. Une fois la commande remise, il est fait comme les autres.
      state: step.tracked || step.state === 'done' ? step.state : ('untracked' as const),
      ...(date === null ? {} : { displayDate: date }),
    };
  });
}

/** Le règlement est encore à faire (terme non réglé ou carte en attente). */
export function canSettle(status: PaymentStatus): boolean {
  return status === 'not_required' || status === 'pending';
}
