import type {
  CustomerRequestView,
  CycleStatementView,
  LegalEntityView,
  PayerBillingModeView,
  StatementCyclesView,
} from '@lfd/contracts';
import { BILLING_RHYTHM_KIND_LABELS } from '@lfd/contracts';

import type { PendingAccess } from '../admin/acces-en-attente/pending-access.model';
import { waitingFor } from '../admin/acces-en-attente/pending-access.model';
import type { AdminCompany } from '../comptes-clients/admin-company';

import { companyLine, day, euros, SHOWN_ROWS } from './customer-agent-text';

/**
 * Les textes des inscriptions et de la facturation — même règle que
 * `customer-agent-text.ts` : des champs choisis, aucun `sub`, aucun
 * identifiant interne de personne, aucun contenu de pièce. Une demande client
 * est rendue par son motif, son auteur et son message ; ses photos ne sont
 * jamais lues.
 */

function pendingCompanyLine(company: AdminCompany, now: Date): string {
  const kbis =
    company.kbis === null
      ? 'KBIS non déposé'
      : company.kbis.certifiedAt === null
        ? 'KBIS déposé, à vérifier'
        : 'KBIS vérifié';
  const siret = company.siret === '' ? 'SIRET manquant' : 'SIRET saisi';
  return `- ${companyLine(company)} · créée ${waitingFor(company.createdAt, now)} · ${kbis} · ${siret}`;
}

function accessLine(person: PendingAccess, now: Date): string {
  const who = `${person.firstName} ${person.lastName}`.trim() || person.email;
  const where = person.kind === 'staff' ? 'membre du staff' : `client de ${person.companyName}`;
  return `- ${who} (${person.email}) — ${where}, invité ${waitingFor(person.invitedAt, now)}`;
}

function requestLine(request: CustomerRequestView, now: Date): string {
  const company = request.companyId === null ? 'sans société' : `société ${request.companyId}`;
  return `- [${request.priority}] ${request.reasonLabel} (${request.kind}) — ${request.authorName}, ${company}, reçue ${waitingFor(request.receivedAt, now)} · id ${request.id}`;
}

export interface PendingSignups {
  readonly companies: readonly AdminCompany[];
  readonly access: readonly PendingAccess[];
  readonly requests: readonly CustomerRequestView[] | null;
}

export function pendingSignupsText(pending: PendingSignups, now: Date): string {
  const companies = pending.companies.filter((company) => company.status === 'pending');
  const lines = [
    `${companies.length} société(s) en attente de validation :`,
    ...companies.slice(0, SHOWN_ROWS).map((company) => pendingCompanyLine(company, now)),
    'Pour savoir ce qui bloque l’activation d’une société, lire `signup_read` avec son id.',
    `${pending.access.length} accès en attente (invitation non suivie d'une première connexion) :`,
    ...pending.access.slice(0, SHOWN_ROWS).map((person) => accessLine(person, now)),
  ];
  if (pending.requests === null) {
    lines.push('Demandes clients : REFUSÉ (votre compte ne lit pas la boîte des demandes).');
  } else {
    lines.push(
      `${pending.requests.length} demande(s) client non traitée(s) :`,
      ...pending.requests.slice(0, SHOWN_ROWS).map((request) => requestLine(request, now)),
    );
  }
  return lines.join('\n');
}

export function requestText(request: CustomerRequestView, now: Date): string {
  return [
    `Demande ${request.id} — ${request.reasonLabel} (${request.kind}, priorité ${request.priority}, ${request.audience})`,
    `De ${request.authorName} — ${request.authorEmail} ${request.authorPhone}`.trim(),
    `Société : ${request.companyId ?? 'aucune'}`,
    `Reçue le ${day(request.receivedAt)} (${waitingFor(request.receivedAt, now)})`,
    request.handledAt === null
      ? 'Non traitée.'
      : `Traitée le ${day(request.handledAt)}${request.handledBy === null ? '' : ` par ${request.handledBy}`}`,
    request.anonymizedAt === null ? `Message : ${request.message}` : 'Message : anonymisé.',
  ].join('\n');
}

export function billingModesText(
  entities: readonly LegalEntityView[],
  modes: readonly (PayerBillingModeView | string)[],
): string {
  return entities
    .map((entity, index) => {
      const mode = modes[index];
      if (mode === undefined || typeof mode === 'string') {
        return `Chez ${entity.name} : ${mode ?? 'non lu'}`;
      }
      const since = mode.since === null ? 'par défaut' : `depuis le ${day(mode.since)}`;
      const next =
        mode.scheduled === null
          ? ''
          : ` · passera ${BILLING_RHYTHM_KIND_LABELS[mode.scheduled.mode]} le ${day(mode.scheduled.effectiveAt)}`;
      return `Chez ${entity.name} : ${BILLING_RHYTHM_KIND_LABELS[mode.mode]}, ${since}${next}`;
    })
    .join('\n');
}

export function cyclesText(cycles: StatementCyclesView): string {
  return `Périodes : ${cycles.cycles
    .slice(0, SHOWN_ROWS)
    .map(
      (cycle) =>
        `${cycle.periodLabel}${cycle.inProgress ? ' (en cours)' : ''} [${cycle.periodClosesAt}]`,
    )
    .join(', ')}`;
}

export function statementText(statement: CycleStatementView): string {
  const totals = statement.totals;
  return [
    `Relevé ${statement.cycle.periodLabel}${statement.provisional ? ' — PROVISOIRE' : ''} (${statement.scope})`,
    `${totals.orderCount} commande(s) · HT ${euros(totals.htCents)} · TVA ${euros(totals.vatCents)} · TTC ${euros(totals.totalCents)}`,
    `Remises ${euros(totals.discountCents)} · bons ${euros(totals.voucherDiscountCents)} · livraison ${euros(totals.deliveryFeeCents)} · retards ${euros(totals.lateFeeCents)}`,
    statement.selfPayingEntities.length === 0
      ? ''
      : `${statement.selfPayingEntities.length} site(s) payant eux-mêmes, hors de ce relevé.`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}
