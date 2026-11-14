import type { ParamMap } from '@angular/router';
import {
  SALES_OVERSIGHT_CHANNELS,
  SALES_OVERSIGHT_SIGNALS,
  SALES_WORK_LEVELS,
  type SalesOversightChannel,
  type SalesOversightRowView,
  type SalesOversightSignal,
  type SalesWorkGap,
  type SalesWorkLevel,
} from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/**
 * Les filtres du suivi commercial, tels que l'URL les porte : un lien collé
 * rouvre le même tableau. `null` : pas de filtre.
 */
export interface SalesOversightFilters {
  /** L'id du commercial, `"unassigned"`, ou `null` pour toute l'équipe. */
  readonly follower: string | null;
  readonly level: SalesWorkLevel | null;
  readonly signal: SalesOversightSignal | null;
  readonly channel: SalesOversightChannel | null;
  readonly page: number;
}

export const LEVEL_LABELS: Readonly<Record<SalesWorkLevel, string>> = {
  directory: 'Annuaire',
  contacted: 'Contactée',
  qualified: 'Qualifiée',
  opened: 'Ouverte',
  active: 'Active',
};

export const LEVEL_VARIANTS: Readonly<Record<SalesWorkLevel, FoldBadgeVariant>> = {
  directory: 'neutral',
  contacted: 'info',
  qualified: 'accent',
  opened: 'warning',
  active: 'success',
};

export const SIGNAL_LABELS: Readonly<Record<SalesOversightSignal, string>> = {
  late: 'En retard',
  access_resent: 'Accès renvoyé',
  multiple_addresses: 'Plusieurs adresses',
  unassigned_signup: 'Inscription sans suivi',
};

export const CHANNEL_LABELS: Readonly<Record<SalesOversightChannel, string>> = {
  commercial: 'Commercial',
  self: 'Auto-inscription',
};

export const GAP_LABELS: Readonly<Record<SalesWorkGap, string>> = {
  interlocutor: 'interlocuteur',
  noted_contact: 'contact noté',
  billing_address: 'adresse de facturation',
  delivery_address: 'adresse de livraison',
  holder_login: 'connexion du détenteur',
  activation: 'activation',
  first_order: 'première commande',
};

function oneOf<T extends string>(values: readonly T[], raw: string | null): T | null {
  return values.find((value) => value === raw) ?? null;
}

/** Les filtres lus dans l'URL ; une valeur inconnue vaut « pas de filtre ». */
export function filtersFromParams(params: ParamMap): SalesOversightFilters {
  const follower = params.get('follower')?.trim() ?? '';
  const page = Number(params.get('page'));
  return {
    follower: follower === '' ? null : follower,
    level: oneOf(SALES_WORK_LEVELS, params.get('level')),
    signal: oneOf(SALES_OVERSIGHT_SIGNALS, params.get('signal')),
    channel: oneOf(SALES_OVERSIGHT_CHANNELS, params.get('channel')),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** « manque : interlocuteur · contact noté » ; `null` quand rien ne manque. */
export function missingLabel(row: SalesOversightRowView): string | null {
  if (row.missing.length === 0) return null;
  return `manque : ${row.missing.map((gap) => GAP_LABELS[gap]).join(' · ')}`;
}

/** Qui suit la fiche, en mots. */
export function followerLabel(row: SalesOversightRowView): string {
  const follower = row.followedBy;
  if (follower === null) return 'Non attribuée';
  if (follower.archived) return 'Ancien membre';
  return follower.name ?? 'Membre sans nom';
}

/** Une pastille de signal. */
export interface SignalBadge {
  readonly key: SalesOversightSignal;
  readonly label: string;
  readonly variant: FoldBadgeVariant;
}

export function signalBadges(row: SalesOversightRowView): readonly SignalBadge[] {
  return row.signals.map((signal) => ({
    key: signal,
    label:
      signal === 'access_resent' ? `Accès envoyé ${row.accessSentCount}×` : SIGNAL_LABELS[signal],
    variant: signal === 'late' ? 'alert' : 'warning',
  }));
}
