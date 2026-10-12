import type {
  AdminOrderRow,
  CompanyHierarchyView,
  CompanyMemberView,
  CustomerTimelineEntry,
  IssuedInvoicesView,
  MandateSectionView,
  CompanyBankAccountSectionView,
} from '@lfd/contracts';

import type { AdminCompany, AdminCompanyDetail } from '../comptes-clients/admin-company';
import { FOLLOW_ASPECT_LABELS, STATUS_LABELS } from '../comptes-clients/admin-company';

/**
 * Les textes de la trousse des comptes clients — des RÉSUMÉS choisis champ par
 * champ, jamais un objet de l'API recopié.
 *
 * 🔴 C'est ici que tient la règle « rien de sensible » : un formateur ne lit
 * que les champs qu'il nomme. Aucun IBAN (le serveur n'en sert pas : seul
 * `last4` l'est), aucun identifiant Auth0 ni `sub` (les vues lues n'en portent
 * pas — vérifié le 2026-10-12 dans `@lfd/contracts` —, et l'identifiant
 * interne d'un membre n'est pas rendu non plus), aucun contenu de pièce : du
 * KBIS et de la preuve de mandat, on dit qu'ils sont déposés ou vérifiés,
 * jamais leur nom de fichier ni leurs octets.
 */

/** Combien de lignes une liste rend au plus : une lecture, pas un export. */
export const SHOWN_ROWS = 20;

export function euros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

export function day(iso: string | null): string {
  return iso === null ? '—' : iso.slice(0, 10);
}

function displayName(company: Pick<AdminCompany, 'enseigne' | 'raisonSociale'>): string {
  return company.enseigne.trim() === '' ? company.raisonSociale : company.enseigne;
}

function cut(total: number): string {
  return total > SHOWN_ROWS ? `\n… liste COUPÉE à ${SHOWN_ROWS} sur ${total}.` : '';
}

/** Une ligne par société : de quoi la reconnaître et la rouvrir par son id. */
export function companyLine(company: AdminCompany): string {
  const parent = company.parent === null ? '' : ` · site de ${company.parent.enseigne}`;
  const warnings =
    company.warnings.length === 0
      ? ''
      : ` · alertes : ${company.warnings.map((warning) => warning.kind).join(', ')}`;
  return `${displayName(company)} (${company.raisonSociale}) — ${STATUS_LABELS[company.status]} · réf ${company.reference} · SIRET ${company.siret || '—'} · id ${company.id}${parent}${warnings}`;
}

export function searchText(all: readonly AdminCompany[], query: string): string {
  const needle = query.trim().toLowerCase();
  const digits = needle.replace(/\s/g, '');
  const found = all.filter(
    (company) =>
      needle === '' ||
      company.raisonSociale.toLowerCase().includes(needle) ||
      company.enseigne.toLowerCase().includes(needle) ||
      company.reference.toLowerCase().includes(needle) ||
      (digits !== '' && company.siret.includes(digits)),
  );
  if (found.length === 0) {
    return `Aucune société ne correspond à « ${query} » (sur ${all.length}).`;
  }
  return (
    [
      `${found.length} société(s) sur ${all.length} :`,
      ...found.slice(0, SHOWN_ROWS).map(companyLine),
    ].join('\n') + cut(found.length)
  );
}

function kbisLine(company: AdminCompanyDetail): string {
  const kbis = company.kbis;
  if (kbis === null) {
    return 'KBIS : non déposé';
  }
  return kbis.certifiedAt === null
    ? `KBIS : déposé le ${day(kbis.uploadedAt)}, À VÉRIFIER`
    : `KBIS : déposé le ${day(kbis.uploadedAt)}, vérifié le ${day(kbis.certifiedAt)}`;
}

function statusCause(company: AdminCompanyDetail): string {
  if (company.status === 'suspended') {
    return company.suspensionCause === 'kbis_revoked'
      ? ' — cause : certification du KBIS retirée'
      : ' — cause : suspendu par le staff';
  }
  if (company.status === 'pending') {
    return company.gate.canActivate
      ? ' — activable'
      : ` — ce qui bloque l'activation : ${company.gate.blocking.join(', ')}`;
  }
  return '';
}

export function accountText(company: AdminCompanyDetail): string {
  const contact = company.primaryContact;
  const owner = company.owner;
  return [
    `${displayName(company)} — ${company.raisonSociale} (${company.formeJuridique || 'forme non dite'})`,
    `id ${company.id} · réf ${company.reference} · SIRET ${company.siret || '—'} · TVA ${company.vatNumber || '—'}`,
    `Statut : ${STATUS_LABELS[company.status]}${statusCause(company)}`,
    `Créée le ${day(company.createdAt)} · activée le ${day(company.activatedAt)}${company.activation?.by ? ` par ${company.activation.by.name}` : ''}`,
    `Termes accordés : ${company.grantedTerms.join(', ') || 'aucun'} · demandé : ${company.requestedTerm ?? 'rien'}`,
    `Prélèvement bloqué : ${company.directDebitBlocked ? 'OUI' : 'non'} · RIB enregistré : ${company.hasBankAccount ? 'oui' : 'non'}`,
    kbisLine(company),
    `Contact principal : ${contact.firstName} ${contact.lastName} — ${contact.email} ${contact.phone}`.trim(),
    `Détenteur du compte : ${owner === null ? 'aucun' : `${owner.firstName} ${owner.lastName} — ${owner.email}`}`,
    `Demande d'aide ouverte : ${company.hasOpenSupportRequest ? 'oui' : 'non'}`,
    `Alertes : ${company.warnings.map((warning) => `${warning.kind}${warning.since === null ? '' : ` depuis ${day(warning.since)}`}`).join(', ') || 'aucune'}`,
    'Le commercial attitré n’est servi par aucune route : non lu.',
  ].join('\n');
}

export function hierarchyText(name: string, hierarchy: CompanyHierarchyView): string {
  const follows = hierarchy.follows
    .map((follow) => `${FOLLOW_ASPECT_LABELS[follow.aspect]} depuis ${day(follow.since)}`)
    .join(', ');
  const lines = [
    hierarchy.parent === null
      ? `${name} est un compte PRINCIPAL (aucun parent).`
      : `${name} est un site de ${hierarchy.parent.enseigne} (id ${hierarchy.parent.id}, ${STATUS_LABELS[hierarchy.parent.status]}) — suit : ${follows || 'rien'}.`,
    `Compte de groupe sans livraison : ${hierarchy.groupWithoutDelivery ? 'oui' : 'non'}`,
    `Forme de prélèvement : ${hierarchy.collectionForm === null ? 'non choisie' : `${hierarchy.collectionForm.form} depuis ${day(hierarchy.collectionForm.since)}`}`,
    `${hierarchy.subAccounts.length} sous-compte(s)${hierarchy.subAccounts.length === 0 ? '.' : ' :'}`,
    ...hierarchy.subAccounts.map(
      (site) =>
        `- ${site.enseigne} (${site.city ?? 'ville non dite'}) — ${STATUS_LABELS[site.status]} · suit : ${site.followedAspects.map((aspect) => FOLLOW_ASPECT_LABELS[aspect]).join(', ') || 'rien'} · id ${site.id}`,
    ),
  ];
  return lines.join('\n');
}

/** Sans `userId` : un identifiant interne n'aide pas à lire, et on ne le prête pas. */
export function membersText(members: readonly CompanyMemberView[]): string {
  if (members.length === 0) {
    return 'Aucun membre.';
  }
  return [
    `${members.length} membre(s) :`,
    ...members.map(
      (member) =>
        `- ${member.firstName} ${member.lastName} — ${member.email} · rôle ${member.role} · ${member.status} · depuis ${day(member.joinedAt)}`,
    ),
  ].join('\n');
}

export function ordersText(orders: readonly AdminOrderRow[]): string {
  if (orders.length === 0) {
    return 'Aucune commande.';
  }
  return [
    `${orders.length} commande(s), les plus récentes d'abord :`,
    ...orders.map(
      (order) =>
        `- ${order.orderNumber} du ${day(order.placedAt)} — ${order.status} · paiement ${order.paymentStatus} · ${order.fulfillmentMethod} · ${euros(order.totalCents)} TTC${order.companyDisplayName === null ? '' : ` · ${order.companyDisplayName}`} · id ${order.id}`,
    ),
  ].join('\n');
}

export function invoicesText(view: IssuedInvoicesView): string {
  const invoices = view.invoices;
  if (invoices.length === 0) {
    return 'Aucune facture émise.';
  }
  return (
    [
      `${invoices.length} facture(s) émise(s) :`,
      ...invoices
        .slice(0, SHOWN_ROWS)
        .map(
          (invoice) =>
            `- ${invoice.number} (${invoice.kind}${invoice.correctedInvoiceNumber === null ? '' : `, corrige ${invoice.correctedInvoiceNumber}`}) émise le ${day(invoice.issuedOn)} · échéance ${day(invoice.dueOn)}${invoice.periodLabel === null ? '' : ` · ${invoice.periodLabel}`} · ${euros(invoice.totalTtcCents)} TTC · document ${invoice.documentAvailable ? 'disponible' : 'absent'}`,
        ),
    ].join('\n') + cut(invoices.length)
  );
}

/**
 * Le mandat et le RIB : `last4` seulement — le serveur ne sert jamais l'IBAN,
 * et le BIC, le titulaire et son adresse ne sont pas rendus non plus.
 */
export function mandateText(
  section: MandateSectionView,
  bank: CompanyBankAccountSectionView,
): string {
  const mandate = section.mandate;
  const account = bank.account;
  return [
    account === null ? 'RIB : aucun' : `RIB : enregistré, se termine par ${account.last4}`,
    mandate === null
      ? 'Mandat : aucun'
      : `Mandat ${mandate.reference} — ${mandate.status} · ${mandate.scheme} · compte …${mandate.last4} · accepté le ${day(mandate.acceptedAt)}${mandate.revokedAt === null ? '' : ` · révoqué le ${day(mandate.revokedAt)}`} · preuve signée ${mandate.hasProof ? 'déposée' : 'ABSENTE'}`,
    `Ce qui empêche de frapper un mandat : ${section.mintBlockers.join(', ') || 'rien'}`,
  ].join('\n');
}

export function journalText(timeline: readonly CustomerTimelineEntry[]): string {
  if (timeline.length === 0) {
    return 'Journal vide.';
  }
  return (
    [
      `${timeline.length} fait(s), les plus récents d'abord :`,
      ...[...timeline]
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, SHOWN_ROWS)
        .map(
          (entry) =>
            `- ${entry.occurredAt.slice(0, 16).replace('T', ' ')} ${entry.type} — ${entry.actorName === '' ? entry.actorType : entry.actorName}${entry.outcome === null ? '' : ` · ${entry.outcome}`}`,
        ),
    ].join('\n') + cut(timeline.length)
  );
}
