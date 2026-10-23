import type {
  BillingRhythmKind,
  CollectionProcedureBatchView,
  CollectionProcedureIdentityView,
  CollectionProcedureStepKeyView,
  CollectionProcedureStepStateView,
  CollectionProcedureView,
} from '@lfd/contracts';
import type { FoldIconName, FoldTabItem } from 'fold-ng';

import { day } from '../invoice-dossier-format';

/**
 * Les mots de la page **Procédure de prélèvement** (plan
 * `plan-page-procedure-de-prelevement.md`). Aucun état n'est calculé ici :
 * il vient du serveur (S1) ; on ne fait que le dire.
 */

export const PAGE_TITLE = 'Procédure de prélèvement';

/** Les onglets, dans l'ordre de la procédure. */
export const STEP_ORDER: readonly CollectionProcedureStepKeyView[] = [
  'accounts',
  'mandates',
  'file',
  'returns',
];

const STEP_LABELS: Readonly<Record<CollectionProcedureStepKeyView, string>> = {
  accounts: '1 Comptes',
  mandates: '2 Mandats',
  file: '3 Fichier',
  returns: '4 Retours',
};

const STATE_ICONS: Readonly<Record<CollectionProcedureStepStateView, FoldIconName | undefined>> = {
  locked: 'lock',
  to_do: undefined,
  waiting: 'clock',
  done: 'check-circle',
};

/** Le rythme, comme la page le titre — mensuel d'abord (Hugo, 2026-10-23). */
const RHYTHM_WORDS: Readonly<Record<BillingRhythmKind, string>> = {
  monthly: 'mensuel',
  semimonthly: 'deux fois par mois',
  weekly: 'hebdomadaire',
};
const RHYTHM_ORDER: readonly BillingRhythmKind[] = ['monthly', 'semimonthly', 'weekly'];

/** « Mensuel », « Mensuel et deux fois par mois » ; vide si le lot n'en dit aucun. */
export function rhythmsLabel(modes: readonly BillingRhythmKind[]): string {
  const words = RHYTHM_ORDER.filter((mode) => modes.includes(mode)).map(
    (mode) => RHYTHM_WORDS[mode],
  );
  const last = words.pop();
  if (last === undefined) {
    return '';
  }
  const text = words.length === 0 ? last : `${words.join(', ')} et ${last}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** « Mensuel · période du 1er au 31 octobre 2026 » — le libellé court d'un lot. */
export function batchShortLabel(batch: CollectionProcedureBatchView): string {
  const rhythms = rhythmsLabel(batch.payerModes);
  const period = `période ${batch.periodLabel}`;
  return rhythms === '' ? period : `${rhythms} · ${period}`;
}

/**
 * Le titre de la page : le code court de la procédure (`PRL-261031-M`), puis
 * le contexte du lot suivi, ou le seul nom quand aucun lot n'est ouvert
 * (Hugo, 2026-10-23).
 */
export function pageTitle(view: CollectionProcedureView | null): string {
  const code = view?.procedure?.code;
  const title = code === undefined ? PAGE_TITLE : `${PAGE_TITLE} ${code}`;
  const followed = view?.followed;
  if (followed === undefined || followed === null || followed.status === 'cancelled') {
    return title;
  }
  const rhythms = rhythmsLabel(followed.payerModes);
  const period = `période ${followed.periodLabel}`;
  return rhythms === '' ? `${title} — ${period}` : `${title} — ${rhythms} — ${period}`;
}

/** La barre d'onglets : l'état en icône, le nombre en attente en badge (§ 4.2). */
export function procedureTabs(
  view: CollectionProcedureView,
): readonly FoldTabItem<CollectionProcedureStepKeyView>[] {
  const badges: Readonly<Record<CollectionProcedureStepKeyView, number | null>> = {
    accounts: view.accounts.state === 'to_do' ? view.accounts.toExportCount : null,
    mandates: view.mandates.state === 'to_do' ? view.mandates.toExportCount : null,
    file: null,
    returns: view.returns.pendingReturnCount > 0 ? view.returns.pendingReturnCount : null,
  };
  return STEP_ORDER.map((key) => {
    const icon = STATE_ICONS[view[key].state];
    return {
      key,
      label: STEP_LABELS[key],
      badge: badges[key],
      ...(icon === undefined ? {} : { icon }),
    };
  });
}

/** « déposer avant le 12 nov. 2026 à 13:45 », ou la limite à renseigner. */
export function deadlineLabel(batch: CollectionProcedureBatchView): string {
  const deadline = batch.depositDeadline;
  return deadline === null
    ? 'limite de dépôt à renseigner'
    : `déposer avant le ${day(deadline.day)} à ${deadline.time}`;
}

/** « échéance le 16 nov. 2026 », ou rien pour un lot d'avant l'échéance figée. */
export function collectionDayLabel(batch: CollectionProcedureBatchView): string {
  return batch.requestedCollectionDay === null
    ? 'échéance du fichier stocké'
    : `échéance le ${day(batch.requestedCollectionDay)}`;
}

/** Pourquoi un onglet est verrouillé, et vers quel onglet aller (Q6, option A). */
export const LOCK_REASONS: Readonly<
  Partial<
    Record<
      CollectionProcedureStepKeyView,
      { readonly text: string; readonly go: CollectionProcedureStepKeyView }
    >
  >
> = {
  mandates: {
    text: 'Importer d’abord les comptes à la banque : elle refuse un mandat dont le compte lui est inconnu.',
    go: 'accounts',
  },
  returns: {
    text: 'Un retour ne s’enregistre que sur un lot déposé : déposer d’abord le fichier.',
    go: 'file',
  },
};

/**
 * **La mutualisation** (Hugo, 2026-10-23) : le hasard des dates fait clore
 * plusieurs rythmes le même jour — une seule clôture, un seul lot. Lue des
 * rythmes que le serveur sert (`closureModes`), jamais recalculée ici.
 */
const POOLED_ORDER: readonly BillingRhythmKind[] = ['weekly', 'semimonthly', 'monthly'];

const RHYTHM_PLURALS: Readonly<Record<BillingRhythmKind, readonly [string, string]>> = {
  weekly: ['hebdomadaire', 'hebdomadaires'],
  semimonthly: ['facturé deux fois par mois', 'facturés deux fois par mois'],
  monthly: ['mensuel', 'mensuels'],
};

export const POOLED_BADGE = 'Mutualisée';

export function isPooled(modes: readonly BillingRhythmKind[]): boolean {
  return new Set(modes).size > 1;
}

/** « hebdomadaire + mensuel : une seule clôture, un seul lot » — le titre du badge. */
export function pooledTitle(modes: readonly BillingRhythmKind[]): string {
  const words = POOLED_ORDER.filter((mode) => modes.includes(mode)).map(
    (mode) => RHYTHM_WORDS[mode],
  );
  return `${words.join(' + ')} : une seule clôture, un seul lot`;
}

/**
 * La phrase de l'encadré du détail : quels rythmes sont réunis, et combien de
 * clients de chacun le lot prélève — lus des factures du lot ; sans lot, on
 * le dit plutôt que d'inventer un compte.
 */
export function pooledSentence(procedure: CollectionProcedureIdentityView): string {
  const head = `Clôture mutualisée — ${pooledTitle(procedure.closureModes)}.`;
  const counts = procedure.payerCounts;
  if (counts === null) {
    return `${head} Le nombre de clients de chaque rythme se lira une fois le lot préparé.`;
  }
  const parts = POOLED_ORDER.flatMap((mode) => {
    const found = counts.find((count) => count.mode === mode);
    if (found === undefined) {
      return [];
    }
    const [one, many] = RHYTHM_PLURALS[mode];
    return [`${String(found.count)} ${found.count > 1 ? many : one}`];
  });
  return parts.length === 0
    ? `${head} Aucun client prélevé par ses lots.`
    : `${head} Clients prélevés : ${parts.join(', ')}.`;
}
