import type {
  HandoverQueueEntryView,
  OrderTransferStateView,
  OrderTransferView,
  ResupplyTransferView,
} from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

import { clockOf, formatHour, stillRemittable } from './handover-queue';

/**
 * **Le transfert interne vu du comptoir** (plan
 * `livraisons/transferts/plan-transfert-interne.md`, lots T2 et T3).
 *
 * Une commande d'un site servi par transfert n'est au comptoir qu'une fois le
 * transfert REÇU : avant, le serveur refuse de la remettre
 * (`handover.transfer_not_received`, `handover.transfer_not_yet_composed`).
 * Ces fonctions disent ce refus avant le geste, et rassemblent les transferts
 * d'un onglet pour la bande « Réceptionner » ; le serveur reste l'autorité.
 */

/** Un transfert de l'onglet, tel que la bande le montre. */
export interface CounterTransfer {
  /** Clé de rendu : l'identifiant du transfert, ou `awaiting:<site>`. */
  readonly key: string;
  readonly transferId: string | null;
  readonly siteLabel: string;
  readonly state: OrderTransferStateView;
  readonly at: string | null;
  readonly binCount: number;
  readonly orderCount: number;
  /** Les réassorts d'un transfert de réassort seul (R3c) ; 0 sinon. */
  readonly resupplyCount: number;
}

const STATE_ORDER: Readonly<Record<OrderTransferStateView, number>> = {
  awaiting: 0,
  planned: 1,
  departed: 2,
  received: 3,
};

const STATE_LABELS: Readonly<Record<OrderTransferStateView, string>> = {
  awaiting: 'Pas encore composé',
  planned: 'Prévu',
  departed: 'Parti',
  received: 'Reçu',
};

const STATE_VARIANTS: Readonly<Record<OrderTransferStateView, FoldBadgeVariant>> = {
  awaiting: 'neutral',
  planned: 'warning',
  departed: 'info',
  received: 'success',
};

export function transferStateLabel(state: OrderTransferStateView): string {
  return STATE_LABELS[state];
}

export function transferStateVariant(state: OrderTransferStateView): FoldBadgeVariant {
  return STATE_VARIANTS[state];
}

/**
 * **Pourquoi cette ligne ne se remet pas encore**, ou `null`.
 *
 * Rien sur une commande retirée ou annulée : le transfert n'y change plus
 * rien, et la ligne dit déjà son état.
 */
export function transferBlockReason(entry: HandoverQueueEntryView): string | null {
  const transfer = entry.transfer;
  if (transfer === null || transfer === undefined || !stillRemittable(entry.state)) {
    return null;
  }
  return blockOf(transfer);
}

function blockOf(transfer: OrderTransferView): string | null {
  switch (transfer.state) {
    case 'received':
      return null;
    case 'awaiting':
      return `Pas encore partie vers ${transfer.siteLabel} : la journée n'est pas clôturée, aucun transfert ne la porte. Elle se remettra une fois le transfert reçu.`;
    case 'planned':
      return `Le transfert vers ${transfer.siteLabel} n'est pas parti : réceptionnez-le avant de remettre.`;
    case 'departed':
      return `En route vers ${transfer.siteLabel} : réceptionnez le transfert avant de remettre.`;
  }
}

/**
 * **Les transferts des lignes de l'onglet**, un par transfert, du plus en
 * retard (pas encore composé) au reçu. Les commandes qu'aucun transfert ne
 * porte encore se regroupent par site. Les transferts de réassort seul
 * (R3c, R3e), qu'aucune ligne ne désigne, s'y ajoutent.
 */
export function transfersOf(
  entries: readonly HandoverQueueEntryView[],
  resupplyOnly: readonly ResupplyTransferView[] = [],
): readonly CounterTransfer[] {
  const byKey = new Map<string, CounterTransfer>();
  for (const entry of entries) {
    const transfer = entry.transfer;
    if (transfer === null || transfer === undefined) {
      continue;
    }
    const key = transfer.transferId ?? `awaiting:${transfer.siteLabel}`;
    const known = byKey.get(key);
    byKey.set(
      key,
      known === undefined
        ? {
            key,
            transferId: transfer.transferId,
            siteLabel: transfer.siteLabel,
            state: transfer.state,
            at: transfer.at,
            binCount: transfer.binCount,
            orderCount: 1,
            resupplyCount: 0,
          }
        : { ...known, orderCount: known.orderCount + 1 },
    );
  }
  for (const transfer of resupplyOnly) {
    byKey.set(transfer.transferId, {
      key: transfer.transferId,
      transferId: transfer.transferId,
      siteLabel: transfer.siteLabel,
      state: transfer.state,
      at: transfer.at,
      binCount: transfer.binCount,
      orderCount: 0,
      resupplyCount: transfer.resupplyCount,
    });
  }
  return [...byKey.values()].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
}

/**
 * « 3 bacs · 5 commandes · parti à 7 h 12 » — la ligne sous le nom du site ;
 * « 1 bac · 2 réassorts · … » pour un transfert de réassort seul.
 */
export function transferSummary(transfer: CounterTransfer): string {
  const parts = [plural(transfer.binCount, 'bac', 'bacs')];
  if (transfer.orderCount > 0 || transfer.resupplyCount === 0) {
    parts.push(plural(transfer.orderCount, 'commande', 'commandes'));
  }
  if (transfer.resupplyCount > 0) {
    parts.push(plural(transfer.resupplyCount, 'réassort', 'réassorts'));
  }
  if (transfer.at !== null && transfer.state !== 'planned') {
    const hour = formatHour(clockOf(new Date(transfer.at)));
    parts.push(transfer.state === 'received' ? `reçu à ${hour}` : `parti à ${hour}`);
  }
  return parts.join(' · ');
}

/** Peut-on réceptionner ce transfert d'ici ? Ni reçu, ni pas encore composé. */
export function receivable(transfer: CounterTransfer): boolean {
  return transfer.state === 'planned' || transfer.state === 'departed';
}

/**
 * Le motif est obligatoire quand le transfert n'est parti dans aucune tournée
 * (réception manuelle, §6.4 du plan) ; le domaine le revérifie.
 */
export function reasonRequired(transfer: CounterTransfer): boolean {
  return transfer.state === 'planned';
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
