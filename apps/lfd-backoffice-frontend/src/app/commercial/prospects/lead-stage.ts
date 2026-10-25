import type { FoldIconName } from 'fold-ng';
import type { ActiveLeadStatus, LeadStatus } from '@lfd/contracts';

/** Ton fold d'un badge — accepté par `fold-badge [variant]`. */
export type BadgeVariant = 'neutral' | 'accent' | 'info' | 'warning' | 'alert' | 'success';

/** Une action de suivi proposée sur une ligne. */
export interface LeadAction {
  readonly status: Exclude<LeadStatus, 'new'>;
  readonly label: string;
  readonly icon: FoldIconName;
  readonly danger: boolean;
}

/** L'étape d'un lead telle que la colonne « Étape » la montre. */
export const LEAD_STAGE: Readonly<
  Record<ActiveLeadStatus, { readonly label: string; readonly variant: BadgeVariant }>
> = {
  new: { label: 'Nouveau', variant: 'neutral' },
  contacted: { label: 'Contacté', variant: 'info' },
  qualified: { label: 'Qualifié', variant: 'accent' },
  negotiating: { label: 'En négociation', variant: 'warning' },
};

/** Rang des étapes ouvertes : le pipeline ne recule pas. */
const RANK: Readonly<Record<ActiveLeadStatus, number>> = {
  new: 0,
  contacted: 1,
  qualified: 2,
  negotiating: 3,
};

const ADVANCE_STEPS: readonly {
  readonly status: Exclude<ActiveLeadStatus, 'new'>;
  readonly label: string;
  readonly icon: FoldIconName;
}[] = [
  { status: 'contacted', label: 'Marquer contacté', icon: 'phone' },
  { status: 'qualified', label: 'Marquer qualifié', icon: 'check' },
  { status: 'negotiating', label: 'En négociation', icon: 'stats' },
];

/**
 * Les actions proposées sur une ligne : les étapes **en avant** de l'étape
 * courante, puis convertir ou perdre — toujours possibles depuis une étape
 * ouverte (l'agrégat `Lead` refuse le reste).
 */
export function actionsFor(status: ActiveLeadStatus): readonly LeadAction[] {
  const forward: LeadAction[] = ADVANCE_STEPS.filter(
    (step) => RANK[step.status] > RANK[status],
  ).map((step) => ({ ...step, danger: false }));
  return [
    ...forward,
    { status: 'converted', label: 'Convertir', icon: 'check-circle', danger: false },
    { status: 'lost', label: 'Marquer perdu', icon: 'x-circle', danger: true },
  ];
}
