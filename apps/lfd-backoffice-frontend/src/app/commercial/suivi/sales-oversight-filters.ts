import type { ParamMap } from '@angular/router';
import {
  SALES_NEXT_STEPS,
  SALES_OVERSIGHT_CARDS,
  SALES_OVERSIGHT_CHANNELS,
  SALES_OVERSIGHT_SIGNALS,
  type SalesLegalPiece,
  type SalesNextStep,
  type SalesNextStepActor,
  type SalesOversightCard,
  type SalesOversightChannel,
  type SalesOversightRowView,
  type SalesOversightSignal,
} from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/**
 * Les filtres du suivi commercial, tels que l'URL les porte : un lien collé
 * rouvre le même tableau. `null` : pas de filtre.
 */
export interface SalesOversightFilters {
  /** L'id du commercial, `"unassigned"`, ou `null` pour toute l'équipe. */
  readonly follower: string | null;
  readonly card: SalesOversightCard | null;
  readonly nextStep: SalesNextStep | null;
  readonly signal: SalesOversightSignal | null;
  readonly channel: SalesOversightChannel | null;
  readonly page: number;
}

export const CARD_LABELS: Readonly<Record<SalesOversightCard, string>> = {
  noContact: 'Sans aucun contact',
  onAccountNotDebitReady: 'Au compte, pas prêts à prélever',
  readyNotActivated: 'Prêts, pas encore activés',
  ordering: 'Clients qui commandent',
};

export const SIGNAL_LABELS: Readonly<Record<SalesOversightSignal, string>> = {
  late: 'En retard',
  access_resent: 'Accès renvoyé',
  multiple_addresses: 'Plusieurs adresses',
  unassigned_signup: 'Inscription sans suivi',
  stale_contact: 'Contact ancien',
};

export const CHANNEL_LABELS: Readonly<Record<SalesOversightChannel, string>> = {
  commercial: 'Un commercial',
  self: 'Le client',
};

export const NEXT_STEP_LABELS: Readonly<Record<SalesNextStep, string>> = {
  assign: 'Attribuer',
  contact: 'Contacter',
  complete_sheet: 'Compléter la fiche',
  bank_account: 'Demander le RIB',
  mandate: 'Faire signer le mandat',
  login: 'Relancer la connexion',
  activate: 'Activer',
  none: 'Rien à faire',
};

export const ACTOR_LABELS: Readonly<Record<SalesNextStepActor, string | null>> = {
  commercial: 'commercial',
  client: 'client',
  accounting: 'compta',
  none: null,
};

const LEGAL_PIECE_LABELS: Readonly<Record<SalesLegalPiece, string>> = {
  legal_identity: 'identité légale',
  vat: 'n° de TVA',
  phone: 'téléphone',
  billing_address: 'adresse de facturation',
};

/** Au-delà, un contact est trop ancien (le même seuil que `stale_contact`). */
export const STALE_CONTACT_DAYS = 30;

function oneOf<T extends string>(values: readonly T[], raw: string | null): T | null {
  return values.find((value) => value === raw) ?? null;
}

/** Les filtres lus dans l'URL ; une valeur inconnue vaut « pas de filtre ». */
export function filtersFromParams(params: ParamMap): SalesOversightFilters {
  const follower = params.get('follower')?.trim() ?? '';
  const page = Number(params.get('page'));
  return {
    follower: follower === '' ? null : follower,
    card: oneOf(SALES_OVERSIGHT_CARDS, params.get('card')),
    nextStep: oneOf(SALES_NEXT_STEPS, params.get('nextStep')),
    signal: oneOf(SALES_OVERSIGHT_SIGNALS, params.get('signal')),
    channel: oneOf(SALES_OVERSIGHT_CHANNELS, params.get('channel')),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Qui suit la fiche, en mots. */
export function followerLabel(row: SalesOversightRowView): string {
  const follower = row.followedBy;
  if (follower === null) return 'Personne';
  if (follower.archived) return 'Ancien membre';
  return follower.name ?? 'Membre sans nom';
}

/** « créée par un commercial », « inscrite par le client ». */
export function originLabel(row: SalesOversightRowView): string {
  const origin =
    row.declaredVia === 'self'
      ? 'inscrite par le client'
      : row.declaredVia === 'staff'
        ? 'créée par un commercial'
        : 'créée';
  return origin;
}

/** « il y a 21 j » : l'âge de la fiche, en rouge au signal `late`. */
export function ageLabel(row: SalesOversightRowView): string {
  return `il y a ${row.ageDays} j`;
}

/** Une cellule de la grille : un mot court, et ce qu'un lecteur d'écran entend. */
export interface StepCell {
  /** `✓` ou un mot court ; `—` quand l'étape n'est pas commencée. */
  readonly text: string;
  /** Ce que dit un lecteur d'écran à la place d'un ✓ ou d'un —. */
  readonly spoken: string;
  readonly tone: 'done' | 'pending' | 'alert' | 'none';
  /** Un détail sous le mot (« demandé : au compte »). */
  readonly detail?: string;
  /** La couleur du détail quand il signale quelque chose (« 3 adresses »). */
  readonly detailTone?: 'warning';
}

const DONE = (spoken: string): StepCell => ({ text: '✓', spoken, tone: 'done' });
const NONE = (spoken: string): StepCell => ({ text: '—', spoken, tone: 'none' });
const WORD = (text: string, tone: StepCell['tone'] = 'pending'): StepCell => ({
  text,
  spoken: text,
  tone,
});

export function contactCell(row: SalesOversightRowView): StepCell {
  const days = row.steps.contact.daysAgo;
  if (days === null) return NONE('aucun contact');
  const text = `il y a ${days} j`;
  return {
    text,
    spoken: `dernier contact ${text}`,
    tone: days > STALE_CONTACT_DAYS ? 'alert' : 'done',
  };
}

export function legalCell(row: SalesOversightRowView): StepCell {
  const legal = row.steps.legal;
  if (legal.missing.length === 0) return DONE('fiche remplie');
  const missing = `manque : ${legal.missing.map((piece) => LEGAL_PIECE_LABELS[piece]).join(', ')}`;
  const text = legal.nameOnly ? 'nom seul' : `${legal.done} sur ${legal.of}`;
  return { text, spoken: text, tone: 'pending', detail: missing };
}

export function kbisCell(row: SalesOversightRowView): StepCell {
  switch (row.steps.kbis) {
    case 'certified':
      return DONE('KBIS certifié');
    case 'to_verify':
      return WORD('à vérifier');
    case 'missing':
      return NONE('pas de KBIS');
  }
}

const RHYTHM_LABELS = { weekly: 'hebdo', semimonthly: '2×/mois', monthly: 'mensuel' } as const;
const MEANS_LABELS = { sepa_debit: 'prélèvement', bank_transfer: 'virement' } as const;

export function paymentCell(row: SalesOversightRowView): StepCell {
  const payment = row.steps.payment;
  const detail = payment.requested ? { detail: 'demandé : au compte' } : {};
  if (payment.terms === 'on_order') return { ...WORD('À la commande', 'none'), ...detail };
  const parts = ['Au compte'];
  if (payment.rhythm !== null) parts.push(RHYTHM_LABELS[payment.rhythm]);
  if (payment.means !== null) parts.push(MEANS_LABELS[payment.means]);
  return { ...WORD(parts.join(' · '), 'done'), ...detail };
}

export function debitCell(row: SalesOversightRowView): StepCell {
  switch (row.steps.debitReady) {
    case 'ready':
      return DONE('prêt à prélever');
    case 'bank_account_missing':
      return WORD('RIB manquant');
    case 'mandate_missing':
      return WORD('mandat à signer');
    case 'blocked':
      return WORD('bloqué par la compta', 'alert');
    case 'not_applicable':
      return WORD('sans objet', 'none');
  }
}

export function deliveryCell(row: SalesOversightRowView): StepCell {
  switch (row.steps.delivery) {
    case 'address':
      return row.signals.includes('multiple_addresses')
        ? {
            ...DONE('adresse de livraison'),
            detail: `${row.deliveryAddressCount} adresses`,
            detailTone: 'warning',
          }
        : DONE('adresse de livraison');
    case 'pickup':
      return WORD('retrait', 'done');
    case 'missing':
      return NONE('pas d’adresse de livraison');
  }
}

export function loginCell(row: SalesOversightRowView): StepCell {
  if (row.steps.login) return DONE('client connecté');
  if (row.accessSentCount > 0) return WORD(`accès envoyé ${row.accessSentCount}×`);
  return NONE('accès pas envoyé');
}

export function ordersCell(row: SalesOversightRowView): StepCell {
  if (!row.steps.activated) return NONE('pas activé');
  const count = row.steps.orders;
  return {
    text: String(count),
    spoken: `activé, ${count} commande${count > 1 ? 's' : ''}`,
    tone: 'done',
  };
}

/** La pastille de la prochaine étape, et qui agit. */
export interface NextStepBadge {
  readonly label: string;
  readonly variant: FoldBadgeVariant;
  readonly actor: string | null;
}

export function nextStepBadge(row: SalesOversightRowView): NextStepBadge {
  const stale = row.nextStep === 'contact' && row.signals.includes('stale_contact');
  return {
    label: stale ? 'Recontacter' : NEXT_STEP_LABELS[row.nextStep],
    variant: row.nextStep === 'assign' ? 'alert' : row.nextStep === 'none' ? 'success' : 'info',
    actor: ACTOR_LABELS[row.nextStepActor],
  };
}
