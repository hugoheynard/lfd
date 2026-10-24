import type {
  CollectionProcedureDebtorAccountView,
  CollectionProcedureDebtorGapView,
  CollectionProcedureDebtorMandateView,
} from '@lfd/contracts';

/**
 * Les mots de l'avertissement par débiteur du lot (plan
 * `plan-page-procedure-de-prelevement.md`, P4 révisé le 2026-10-24). Rien
 * n'est calculé ici : le serveur dit ce qui manque, l'écran le nomme et mène
 * à l'onglet qui le règle.
 */

const ACCOUNT_MISSING: Readonly<
  Record<Exclude<CollectionProcedureDebtorAccountView, 'known'>, string>
> = {
  in_export: 'compte en export, pas encore marqué importé',
  not_exported: 'compte jamais exporté',
  excluded: 'compte écarté de l’export (sans BIC)',
};

const MANDATE_MISSING: Readonly<
  Record<Exclude<CollectionProcedureDebtorMandateView, 'imported'>, string>
> = {
  in_export: 'mandat en export, pas encore marqué importé',
  not_exported: 'mandat jamais exporté',
  excluded: 'mandat écarté de l’export',
  inactive: 'mandat qui n’est plus actif',
};

/** L'en-tête de l'avertissement — la réponse 15 dit pourquoi ce n'est pas un verrou. */
export function debtorGapsHeadline(count: number): string {
  const subject =
    count === 1 ? '1 débiteur de ce lot n’a pas' : `${count} débiteurs de ce lot n’ont pas`;
  return `${subject} son compte ou son mandat importé dans CENET : la banque ne le contrôle pas au dépôt (réponse 15), mais importez-les pour garder le référentiel à jour.`;
}

/** « compte jamais exporté, mandat jamais exporté » — ce qui manque, compte d'abord. */
export function debtorGapMissing(gap: CollectionProcedureDebtorGapView): string {
  const parts: string[] = [];
  if (gap.account !== null && gap.account !== 'known') {
    parts.push(ACCOUNT_MISSING[gap.account]);
  }
  if (gap.mandate !== 'imported') {
    parts.push(MANDATE_MISSING[gap.mandate]);
  }
  return parts.join(', ');
}

/** L'onglet qui règle l'écart : le compte d'abord, l'onglet 2 restant verrouillé sans lui. */
export function debtorGapStep(gap: CollectionProcedureDebtorGapView): 'accounts' | 'mandates' {
  return gap.account !== null && gap.account !== 'known' ? 'accounts' : 'mandates';
}

export const DEBTOR_GAP_STEP_LABEL: Readonly<Record<'accounts' | 'mandates', string>> = {
  accounts: 'Onglet 1 Comptes',
  mandates: 'Onglet 2 Mandats',
};
