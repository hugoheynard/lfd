// Types par le sous-chemin sans zod (budget `cloudflare`).
import type { OrderRevisability } from '@lfd/contracts/shop-values';

import type { LocaleCode } from '../client-locale.service';
import { fill } from '../copy/client-copy.service';
import type { OrderReviseCopy } from '../copy/screens/orders.copy';
import { SHOP_TIME_ZONE } from '../shop-time-zone';

/**
 * Ce que le tiroir dit de la modification : le bouton (avec, s'il y en a une,
 * l'heure limite), une phrase à la place du bouton, ou rien — l'état de la
 * commande dit déjà qu'elle est annulée, prête ou retirée.
 */
export type ReviseOffer =
  | { readonly kind: 'revise'; readonly until: string | null }
  | { readonly kind: 'refused'; readonly sentence: string }
  | { readonly kind: 'none' };

/**
 * **La modificabilité dite au client** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, §6) — le serveur
 * décide par la règle du geste (`revisability` de `GET /orders/:id`), la
 * boutique ne fait que le dire dans la langue du client.
 */
export function reviseOfferOf(
  revisability: OrderRevisability,
  locale: LocaleCode,
  copy: OrderReviseCopy,
): ReviseOffer {
  if (revisability.revisable) {
    const until = revisability.until;
    return {
      kind: 'revise',
      until: until === null ? null : fill(copy.reviseUntil, { when: whenOf(until, locale, copy) }),
    };
  }
  const { code, until } = revisability;
  switch (code) {
    case 'cancelled':
    case 'ready':
    case 'fulfilled':
      return { kind: 'none' };
    case 'card_settled':
      return refused(copy.reviseCardNote);
    case 'too_late':
      return refused(
        until === null
          ? copy.refusedTooLate
          : fill(copy.refusedTooLateUntil, { when: whenOf(until, locale, copy) }),
      );
    case 'in_preparation':
      return refused(copy.refusedInPreparation);
    case 'accounting':
      return refused(copy.refusedAccounting);
    case 'payment_in_progress':
      return refused(copy.refusedPaymentInProgress);
    case 'unavailable':
      return refused(copy.refusedUnavailable);
  }
}

function refused(sentence: string): ReviseOffer {
  return { kind: 'refused', sentence };
}

/** L'heure limite « 14/10 à 18:00 », lue à Paris — jamais dans le fuseau du navigateur. */
function whenOf(iso: string, locale: LocaleCode, copy: OrderReviseCopy): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return iso;
  }
  const day = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    timeZone: SHOP_TIME_ZONE,
  }).format(instant);
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: SHOP_TIME_ZONE,
  }).format(instant);
  return fill(copy.reviseWhen, { day, time });
}
