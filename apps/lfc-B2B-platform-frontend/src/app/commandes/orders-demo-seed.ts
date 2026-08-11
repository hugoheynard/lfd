import type { OrderStatus } from '@lfd/contracts';

import type { Company } from '../account/account.model';
import { companyDisplayName } from '../account/account.model';

/**
 * Une ligne de la table « Mes commandes », telle qu'affichée. Vue **aplatie**
 * (établissement, lieu, régime déjà résolus) — la table ne joint rien.
 */
export interface CommandeRow {
  readonly id: string;
  readonly reference: string;
  readonly date: string;
  readonly establishment: string;
  readonly deliveryPlace: string;
  readonly status: OrderStatus;
  readonly totalEur: number;
  /** Réglée **immédiatement** (hors relevé mensuel) : exclue du montant à régler. */
  readonly paid: boolean;
}

/** Gabarit d'une commande démo (statut, jours d'ancienneté, lieu, montant). */
interface DemoTemplate {
  readonly status: OrderStatus;
  /** Nombre de mois en arrière (0 = mois courant). */
  readonly monthsAgo: number;
  /** Jour du mois de la commande. */
  readonly day: number;
  readonly place: string;
  readonly totalEur: number;
  /** Réglée immédiatement (hors relevé). */
  readonly paid?: boolean;
}

// Étalé sur 3 mois pour que le regroupement par période ait de la matière :
// mois courant (en cours), le précédent (à régler), l'antérieur (réglé). Quelques
// commandes sont payées immédiatement (`paid`) : elles quittent les relevés et
// alimentent la colonne « payé à la commande ».
const TEMPLATES: readonly DemoTemplate[] = [
  { status: 'in_production', monthsAgo: 0, day: 6, place: 'Boutique principale', totalEur: 342.0 },
  { status: 'placed', monthsAgo: 0, day: 2, place: 'Entrepôt Nord', totalEur: 96.0 },
  {
    status: 'fulfilled',
    monthsAgo: 0,
    day: 10,
    place: 'Boutique principale',
    totalEur: 64.5,
    paid: true,
  },
  { status: 'fulfilled', monthsAgo: 1, day: 28, place: 'Boutique principale', totalEur: 96.8 },
  {
    status: 'fulfilled',
    monthsAgo: 1,
    day: 22,
    place: 'Boutique principale',
    totalEur: 158.4,
    paid: true,
  },
  {
    status: 'fulfilled',
    monthsAgo: 1,
    day: 27,
    place: 'Entrepôt Nord',
    totalEur: 331.2,
    paid: true,
  },
  {
    status: 'fulfilled',
    monthsAgo: 1,
    day: 16,
    place: 'Boutique principale',
    totalEur: 45.9,
    paid: true,
  },
  {
    status: 'fulfilled',
    monthsAgo: 1,
    day: 9,
    place: 'Boutique principale',
    totalEur: 214.0,
    paid: true,
  },
  { status: 'fulfilled', monthsAgo: 1, day: 5, place: 'Entrepôt Nord', totalEur: 72.5, paid: true },
  { status: 'fulfilled', monthsAgo: 1, day: 15, place: 'Entrepôt Nord', totalEur: 342.0 },
  { status: 'fulfilled', monthsAgo: 1, day: 4, place: 'Boutique principale', totalEur: 845.7 },
  { status: 'fulfilled', monthsAgo: 2, day: 20, place: 'Boutique principale', totalEur: 1284.4 },
  { status: 'fulfilled', monthsAgo: 2, day: 8, place: 'Entrepôt Nord', totalEur: 732.0 },
  {
    status: 'fulfilled',
    monthsAgo: 2,
    day: 3,
    place: 'Entrepôt Nord',
    totalEur: 120.0,
    paid: true,
  },
];

/** Réf. lisible dérivée de la référence entreprise (`C-XXXXXX` → `CMD-XXXXXX-n`). */
function reference(company: Company, index: number): string {
  const base = company.reference.replace(/^C-/u, '');
  return `CMD-${base}-${(index + 1).toString().padStart(2, '0')}`;
}

/** Date ISO d'un jour donné, `monthsAgo` mois avant le mois courant. */
function monthsAgoOn(monthsAgo: number, day: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, day, 9));
  return date.toISOString();
}

/**
 * Jeu de commandes **démo** pour l'établissement — front-only, le temps de
 * dessiner la table et les relevés. À remplacer par
 * `OrdersService.loadOrders(companyId)` quand le carnet réel sera peuplé (le back
 * expose déjà l'endpoint).
 */
export function buildDemoOrders(company: Company): readonly CommandeRow[] {
  const establishment = companyDisplayName(company);
  return TEMPLATES.map((template, index) => ({
    id: `${company.id}-demo-${index}`,
    reference: reference(company, index),
    date: monthsAgoOn(template.monthsAgo, template.day),
    establishment,
    deliveryPlace: template.place,
    status: template.status,
    totalEur: template.totalEur,
    paid: template.paid ?? false,
  }));
}
