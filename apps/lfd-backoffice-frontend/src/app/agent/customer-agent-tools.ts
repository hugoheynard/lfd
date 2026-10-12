import { declareExperimentalWebMcpTool, inject } from '@angular/core';

import { PendingAccessService } from '../admin/acces-en-attente/pending-access.service';
import { CustomerRequestsService } from '../b2b/demandes/customer-requests.service';
import { CustomerSheetService } from '../commercial/calendrier/customer-sheet/customer-sheet.service';
import { AdminOrdersService } from '../commandes/orders.service';
import { IssuedInvoicesService } from '../comptabilite/issued-invoices.service';
import { LegalEntitiesService } from '../comptabilite/legal-entities.service';
import { AdminCompaniesService } from '../comptes-clients/admin-companies.service';
import { BankAccountService } from '../fiche-client/bank-account/bank-account.service';
import { CycleStatementService } from '../fiche-client/facturation/cycle-statement.service';
import { PayerBillingModeService } from '../fiche-client/facturation/payer-billing-mode.service';
import { MandatesService } from '../fiche-client/mandat/mandates.service';

import { said } from './agent-tool-text';
import {
  billingModesText,
  cyclesText,
  pendingSignupsText,
  requestText,
  statementText,
} from './customer-agent-signup-text';
import {
  accountText,
  hierarchyText,
  invoicesText,
  journalText,
  mandateText,
  membersText,
  ordersText,
  searchText,
  SHOWN_ROWS,
} from './customer-agent-text';

/** Les noms de la trousse, dans l'ordre où la page les affiche. */
export const CUSTOMER_AGENT_TOOLS = [
  'accounts_search',
  'account_read',
  'account_hierarchy',
  'account_members',
  'account_orders',
  'account_invoices',
  'account_billing',
  'account_mandate',
  'account_journal',
  'signups_pending',
  'signup_read',
] as const;

const NO_INPUT = { type: 'object', properties: {}, additionalProperties: false } as const;
const BY_COMPANY = {
  type: 'object',
  properties: { companyId: { type: 'string' } },
  required: ['companyId'],
  additionalProperties: false,
} as const;

const UNKNOWN = (id: string): string => `Aucune société d'id ${id}.`;

/**
 * **Les outils WebMCP des comptes clients — EN LECTURE SEULE**, pour analyser
 * un compte à deux, l'agent et la personne devant l'écran (Hugo, 2026-10-12).
 *
 * 🔴 **Toutes les méthodes appelées sont des lectures** : chaque outil vise une
 * route `GET` admin existante, par le service de l'écran qui la lit déjà
 * (même session, même mur). Aucun outil n'active, ne suspend, ne rattache, ne
 * certifie, ne frappe de mandat ni ne marque une demande traitée — ces gestes
 * restent à l'écran, sous les yeux de qui les porte. La spec le vérifie : les
 * services qu'elle fournit n'exposent que des lectures, et aucun appel HTTP
 * autre que `GET` ne part.
 *
 * 🔴 **Rien de sensible** : les textes sont des résumés choisis champ par champ
 * (`customer-agent-text.ts`) — jamais d'IBAN (le `last4` seul), jamais de
 * `sub` ni d'identifiant de personne, jamais une pièce (KBIS, preuve de
 * mandat) : on dit qu'elle est déposée ou vérifiée.
 *
 * Absents faute de route (vérifié le 2026-10-12) : les candidats à des
 * sous-comptes, et le commercial attitré d'un compte.
 */
export function declareCustomerAgentTools(): readonly string[] {
  const companies = inject(AdminCompaniesService);
  const sheets = inject(CustomerSheetService);
  const orders = inject(AdminOrdersService);
  const invoices = inject(IssuedInvoicesService);
  const entities = inject(LegalEntitiesService);
  const billingModes = inject(PayerBillingModeService);
  const statements = inject(CycleStatementService);
  const mandates = inject(MandatesService);
  const bank = inject(BankAccountService);
  const access = inject(PendingAccessService);
  const requests = inject(CustomerRequestsService);

  void declareExperimentalWebMcpTool({
    name: 'accounts_search',
    description:
      'Cherche une société cliente par nom (raison sociale ou enseigne), référence ou SIRET (`query`, vide = toutes) : une ligne par société avec son statut, son id, son principal s’il s’agit d’un site, ses alertes. 20 lignes au plus. Lecture seule.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      additionalProperties: false,
    },
    execute: (args) =>
      said('Recherche des sociétés', async () =>
        searchText(await companies.list(), args.query ?? ''),
      ),
  });

  void declareExperimentalWebMcpTool({
    name: 'account_read',
    description:
      'La fiche d’une société (`companyId`) : identité légale, statut et sa cause (ce qui bloque l’activation, suspension), termes accordés et demandés, RIB enregistré ou non, KBIS déposé ou vérifié (jamais son contenu), contact principal, détenteur, alertes. Lecture seule.',
    inputSchema: BY_COMPANY,
    execute: (args) =>
      said('Lecture de la fiche', async () => {
        const company = await companies.getById(args.companyId);
        return company === undefined ? UNKNOWN(args.companyId) : accountText(company);
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'account_hierarchy',
    description:
      'La place d’une société dans son groupe (`companyId`) : son principal et ce qu’elle en suit (facturation, contacts), ou ses sous-comptes avec leur statut et ce que chacun suit ; compte de groupe sans livraison ; forme de prélèvement. Lecture seule.',
    inputSchema: BY_COMPANY,
    execute: (args) =>
      said('Lecture de la hiérarchie', async () => {
        const company = await companies.getById(args.companyId);
        return company === undefined
          ? UNKNOWN(args.companyId)
          : hierarchyText(company.enseigne || company.raisonSociale, company.hierarchy);
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'account_members',
    description:
      'Les membres d’une société (`companyId`) : nom, e-mail, rôle, statut, date d’arrivée. Aucun identifiant de connexion. Lecture seule.',
    inputSchema: BY_COMPANY,
    execute: (args) =>
      said('Lecture des membres', async () =>
        membersText(await companies.listMembers(args.companyId)),
      ),
  });

  void declareExperimentalWebMcpTool({
    name: 'account_orders',
    description:
      'Les 20 dernières commandes d’une société (`companyId`), sous-comptes compris : numéro, date, statut, statut du paiement, mode de retrait, total TTC. Lecture seule.',
    inputSchema: BY_COMPANY,
    execute: (args) =>
      said('Lecture des commandes', async () =>
        ordersText(
          await orders.list({
            companyId: args.companyId,
            withSubAccounts: true,
            limit: SHOWN_ROWS,
          }),
        ),
      ),
  });

  void declareExperimentalWebMcpTool({
    name: 'account_invoices',
    description:
      'Les factures émises à une société (`companyId`) : numéro, nature, date, échéance, période, total TTC, document disponible. Lecture seule — ne renvoie aucun avis.',
    inputSchema: BY_COMPANY,
    execute: (args) =>
      said('Lecture des factures', async () =>
        invoicesText(await invoices.ofCompany(args.companyId)),
      ),
  });

  void declareExperimentalWebMcpTool({
    name: 'account_billing',
    description:
      'La facturation d’une société (`companyId`) : son mode de facturation chez chaque entité émettrice, ses périodes, et le relevé de la période `periodClosesAt` (ISO, tel que listé) — par défaut la période en cours. Lecture seule.',
    inputSchema: {
      type: 'object',
      properties: { companyId: { type: 'string' }, periodClosesAt: { type: 'string' } },
      required: ['companyId'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Lecture de la facturation', async () => {
        const list = await entities.list();
        const modes = await Promise.all(
          // Un refus chez une entité ne vide pas les autres : il se dit sur sa ligne.
          list.map((entity) =>
            billingModes
              .get(entity.id, args.companyId)
              .catch(() => 'mode non lu (refusé par le serveur)'),
          ),
        );
        const cycles = await statements.cycles(args.companyId);
        const period =
          args.periodClosesAt ??
          (cycles.cycles.find((cycle) => cycle.inProgress) ?? cycles.cycles[0])?.periodClosesAt;
        const statement =
          period === undefined
            ? 'Aucune période.'
            : statementText(await statements.statement(args.companyId, period));
        return [billingModesText(list, modes), cyclesText(cycles), statement].join('\n');
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'account_mandate',
    description:
      'Le mandat de prélèvement et le RIB d’une société (`companyId`) : état du mandat, schéma, quatre derniers chiffres du compte (jamais l’IBAN), preuve signée déposée ou non, et ce qui empêche d’en frapper un. Lecture seule.',
    inputSchema: BY_COMPANY,
    execute: (args) =>
      said('Lecture du mandat', async () =>
        mandateText(await mandates.section(args.companyId), await bank.read(args.companyId)),
      ),
  });

  void declareExperimentalWebMcpTool({
    name: 'account_journal',
    description:
      'Les 20 derniers faits du journal d’une société (`companyId`) : date, type, qui. Lecture seule.',
    inputSchema: BY_COMPANY,
    execute: (args) =>
      said('Lecture du journal', async () =>
        journalText((await sheets.sheet(args.companyId)).timeline),
      ),
  });

  void declareExperimentalWebMcpTool({
    name: 'signups_pending',
    description:
      'L’état des inscriptions : sociétés en attente de validation (depuis quand, KBIS, SIRET), accès invités pas encore ouverts (depuis quand), demandes clients non traitées (motif, priorité, depuis quand). Lecture seule.',
    inputSchema: NO_INPUT,
    execute: () =>
      said('Lecture des inscriptions en attente', async () => {
        const [all, people, open] = await Promise.all([
          companies.list(),
          access.list(),
          requests.list('pending').catch(() => null),
        ]);
        return pendingSignupsText({ companies: all, access: people, requests: open }, new Date());
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'signup_read',
    description:
      'Le détail d’une inscription : `companyId` rend la fiche (ce qui bloque l’activation, KBIS déposé ou vérifié — jamais son contenu) ; `requestId` rend une demande client (motif, auteur, message, traitée ou non). Lecture seule.',
    inputSchema: {
      type: 'object',
      properties: { companyId: { type: 'string' }, requestId: { type: 'string' } },
      additionalProperties: false,
    },
    execute: (args) =>
      said('Lecture de l’inscription', async () => {
        if (args.requestId !== undefined) {
          const [open, handled] = await Promise.all([
            requests.list('pending'),
            requests.list('handled'),
          ]);
          const found = [...open, ...handled].find((request) => request.id === args.requestId);
          return found === undefined
            ? `Aucune demande d'id ${args.requestId}.`
            : requestText(found, new Date());
        }
        if (args.companyId === undefined) {
          return 'Donner `companyId` ou `requestId`.';
        }
        const company = await companies.getById(args.companyId);
        return company === undefined ? UNKNOWN(args.companyId) : accountText(company);
      }),
  });

  return CUSTOMER_AGENT_TOOLS;
}
