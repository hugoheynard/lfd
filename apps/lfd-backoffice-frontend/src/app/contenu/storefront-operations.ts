import {
  instantToLocal,
  type StorefrontInfoContent,
  type StorefrontCatalogOperation,
  type StorefrontOperationState,
} from '@lfd/contracts';

/**
 * **Les opérations qu'une annonce peut désigner**, telles que l'éditeur les
 * dit (D11 de `documentation/order/architecture-operations-datees.md`).
 *
 * Des fonctions pures : l'état vient du serveur (`GET /admin/storefront/catalog`,
 * à son horloge), l'éditeur ne fait que le nommer, et calculer la pastille que
 * la boutique posera — la même règle que `operation-badge.ts` côté boutique,
 * en français seul : l'éditeur s'adresse à l'équipe.
 */

/** Le fuseau des dates : celui de la maison, pas celui du poste. */
const PARIS = 'Europe/Paris';

const DAY_MS = 86_400_000;

/** L'état d'une opération, en clair. */
export const OPERATION_STATE_LABELS: Readonly<Record<StorefrontOperationState, string>> = {
  preparing: 'En préparation',
  announced: 'Annoncée',
  open: 'Commandes ouvertes',
  closed: 'Commandes closes',
  ended: 'Terminée',
  hidden: 'Masquée à la réception',
};

/** Les états où la boutique montre une annonce liée. */
const SHOWN: ReadonlySet<StorefrontOperationState> = new Set(['announced', 'open', 'closed']);

export function operationOf(
  operations: readonly StorefrontCatalogOperation[],
  key: string,
): StorefrontCatalogOperation | null {
  return operations.find((operation) => operation.key === key) ?? null;
}

/** « 15 nov. » — un instant lu à l'heure de Paris. */
function shortInstant(instant: string): string {
  const date = new Date(instant);
  return Number.isNaN(date.getTime())
    ? instant
    : new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short', timeZone: PARIS }).format(
        date,
      );
}

/** Midi UTC : un jour `AAAA-MM-JJ` reste le même jour dans tous les fuseaux d'Europe. */
function middayOf(day: string): number {
  return Date.parse(`${day}T12:00:00.000Z`);
}

/** « 24 déc. » — un jour `AAAA-MM-JJ`. */
function shortDay(day: string): string {
  const time = middayOf(day);
  return Number.isNaN(time)
    ? day
    : new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(time),
      );
}

/**
 * La ligne d'une opération dans le choix : son nom, son état, ses dates —
 * « Noël 2026 — Commandes ouvertes · commandes du 15 nov. au 21 déc., retrait
 * du 20 déc. au 24 déc. ».
 */
export function operationOptionLabel(operation: StorefrontCatalogOperation): string {
  return (
    `${operation.name.fr} — ${OPERATION_STATE_LABELS[operation.state]} · ` +
    `commandes du ${shortInstant(operation.orderFrom)} au ${shortInstant(operation.orderUntil)}, ` +
    `retrait du ${shortDay(operation.pickupFrom)} au ${shortDay(operation.pickupUntil)}`
  );
}

/**
 * Ce que l'éditeur signale sur une annonce liée, comme un article plus en
 * vente — `null` quand elle s'affiche. Le serveur l'enregistre quand même
 * (une opération peut arriver au prochain envoi) : c'est un avertissement,
 * pas un refus.
 */
export function operationWarning(
  operations: readonly StorefrontCatalogOperation[],
  key: string,
): string | null {
  const operation = operationOf(operations, key);
  if (operation === null) {
    return 'Opération inconnue du catalogue (retirée, ou pas encore reçue) — l’annonce ne s’affiche pas';
  }
  switch (operation.state) {
    case 'ended':
      return 'Opération terminée — l’annonce ne s’affiche plus';
    case 'hidden':
      return 'Opération masquée à la réception — l’annonce ne s’affiche pas';
    case 'preparing':
      return `Opération en préparation — l’annonce s’affichera à partir du ${shortInstant(operation.announceFrom)}`;
    default:
      return null;
  }
}

/** La boutique montre-t-elle MAINTENANT une annonce liée à cette clé ? */
export function isOperationShown(
  operations: readonly StorefrontCatalogOperation[],
  key: string,
): boolean {
  const operation = operationOf(operations, key);
  return operation !== null && SHOWN.has(operation.state);
}

/**
 * La pastille que la boutique calculera, à `now` : « Dès le 15 nov. »
 * (annoncée — et en préparation, qui l'annoncera ainsi), « J‑18 » (ouverte,
 * jours calendaires de Paris jusqu'à la clôture), « Dernier jour »,
 * « Commandes closes » ; `null` quand l'annonce ne s'affiche pas.
 */
export function inheritedBadge(operation: StorefrontCatalogOperation, now: Date): string | null {
  switch (operation.state) {
    case 'preparing':
    case 'announced':
      return `Dès le ${shortInstant(operation.orderFrom)}`;
    case 'closed':
      return 'Commandes closes';
    case 'open': {
      const until = new Date(operation.orderUntil);
      if (Number.isNaN(until.getTime())) {
        return null;
      }
      const gap = middayOf(instantToLocal(until).day) - middayOf(instantToLocal(now).day);
      const days = Math.max(Math.round(gap / DAY_MS), 0);
      return days === 0 ? 'Dernier jour' : `J‑${days}`;
    }
    default:
      return null;
  }
}

/**
 * Ce que l'aperçu dit d'une info : sa pastille et son titre, tels que la
 * boutique les montrera — hérités de l'opération quand ils sont vides.
 */
export function infoPreviewText(
  info: StorefrontInfoContent,
  operations: readonly StorefrontCatalogOperation[],
  now: Date,
): string {
  const key = info.operationKey ?? null;
  const operation = key === null ? null : operationOf(operations, key);
  const title = info.title.fr.trim() !== '' ? info.title.fr : (operation?.name.fr ?? 'Sans titre');
  const badge =
    info.badge !== null && info.badge.fr.trim() !== ''
      ? info.badge.fr
      : operation === null
        ? null
        : inheritedBadge(operation, now);
  return badge === null ? title : `${badge} · ${title}`;
}
