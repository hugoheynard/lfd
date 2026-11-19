import type {
  BillingRhythmKind,
  CollectionProcedureBatchView,
  CollectionProcedureIdentityView,
  CollectionProcedureInvoicesStateView,
  CollectionProcedurePeriodView,
  CollectionProcedureStepKeyView,
  CollectionProcedureStepStateView,
  CollectionProcedureView,
} from '@lfd/contracts';
import type { FoldIconName, FoldTabItem } from 'fold-ng';

import { isDeadBatch } from '../collection-batch-steps';
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
  'invoices',
  'file',
  'returns',
];

const STEP_LABELS: Readonly<Record<CollectionProcedureStepKeyView, string>> = {
  accounts: '1 Comptes',
  mandates: '2 Mandats',
  invoices: '3 Factures',
  file: '4 Fichier de prélèvement',
  returns: '5 Retours de la banque',
};

/** « Partiel » n'est connu que de l'onglet Factures (décision de Hugo du 2026-10-26). */
const STATE_ICONS: Readonly<
  Record<
    CollectionProcedureStepStateView | CollectionProcedureInvoicesStateView,
    FoldIconName | undefined
  >
> = {
  locked: 'lock',
  to_do: undefined,
  waiting: 'clock',
  partial: 'minus',
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

/**
 * Les périodes d'une procédure : « Mensuel · période du 1er au 31 octobre
 * 2026 » pour un rythme ; « Mensuel : du 1er au 30 novembre 2026 · Deux fois
 * par mois : du 16 au 30 novembre 2026 » pour une clôture mutualisée. Sans
 * période servie, le rythme et le libellé donnés.
 */
export function periodsTitle(
  periods: readonly CollectionProcedurePeriodView[],
  fallbackModes: readonly BillingRhythmKind[],
  fallbackLabel: string,
): string {
  if (periods.length > 1) {
    return periods.map((period) => `${rhythmsLabel([period.mode])} : ${period.label}`).join(' · ');
  }
  const [only] = periods;
  const rhythms = rhythmsLabel(only === undefined ? fallbackModes : [only.mode]);
  const period = `période ${only?.label ?? fallbackLabel}`;
  return rhythms === '' ? period : `${rhythms} · ${period}`;
}

/**
 * Le titre de la page : le code court de la procédure (`PRL-261031-M`), puis
 * ses périodes — celles de chaque rythme, lues de la procédure plutôt que du
 * lot, dont la période part de la clôture précédente tous rythmes confondus.
 * Sans période servie, celle du lot suivi ; le seul nom sinon.
 */
export function pageTitle(view: CollectionProcedureView | null): string {
  const procedure = view?.procedure ?? null;
  const title = procedure === null ? PAGE_TITLE : `${PAGE_TITLE} ${procedure.code}`;
  if (procedure !== null && procedure.periods.length > 0) {
    return `${title} — ${periodsTitle(procedure.periods, [], '')}`;
  }
  const followed = view?.followed;
  if (followed === undefined || followed === null || isDeadBatch(followed)) {
    return title;
  }
  return `${title} — ${periodsTitle([], followed.payerModes, followed.periodLabel)}`;
}

/**
 * L'en-tête du lot suivi, dans l'ordre où on le vit : quand les clients sont
 * prélevés, puis jusqu'à quand déposer — « Prélèvement SEPA CORE le 4 déc.
 * 2026 · déposer avant le 26 nov. 2026 à 13:45 ».
 */
export function followedHeadline(batch: CollectionProcedureBatchView): string {
  const when =
    batch.requestedCollectionDay === null ? '' : ` le ${day(batch.requestedCollectionDay)}`;
  return `Prélèvement SEPA ${batch.scheme}${when} · ${deadlineLabel(batch)}.`;
}

/** La barre d'onglets : l'état en icône, le nombre en attente en badge (§ 4.2). */
export function procedureTabs(
  view: CollectionProcedureView,
): readonly FoldTabItem<CollectionProcedureStepKeyView>[] {
  const badges: Readonly<Record<CollectionProcedureStepKeyView, number | null>> = {
    accounts: view.accounts.state === 'to_do' ? view.accounts.toExportCount : null,
    mandates: view.mandates.state === 'to_do' ? view.mandates.toExportCount : null,
    invoices:
      view.invoices.state === 'to_do'
        ? view.invoices.figures.receiptConfirmed + view.invoices.figures.receiptToConfirm
        : null,
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

/**
 * Pourquoi un onglet est verrouillé, et vers quel onglet aller (Q6, option A) ;
 * sans `go`, aucun onglet ne lève le verrou — les factures attendent la clôture.
 */
export const LOCK_REASONS: Readonly<
  Partial<
    Record<
      CollectionProcedureStepKeyView,
      { readonly text: string; readonly go?: CollectionProcedureStepKeyView }
    >
  >
> = {
  mandates: {
    text: 'Importer d’abord les comptes à la banque : elle refuse un mandat dont le compte lui est inconnu.',
    go: 'accounts',
  },
  invoices: {
    text: 'La période n’est pas close : ses factures s’émettent la veille de la clôture, à 23 h 55. Les bons à constater se traitent dès maintenant.',
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
