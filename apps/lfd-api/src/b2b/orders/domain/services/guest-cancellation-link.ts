import { addDays, localToInstant } from "@lfd/contracts";

/**
 * **La borne du lien d'annulation d'un invité** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.4,
 * Q-C6.9) : 90 jours après la date de retrait / de livraison, ou après la
 * passation sans date. Calculée sur la COMMANDE — le HMAC n'en sait rien — et
 * aucune colonne d'expiration à tenir. Minimisation : un courriel transféré ou
 * oublié ne montre pas une commande pour toujours.
 */
export const GUEST_CANCELLATION_LINK_LIFETIME_DAYS = 90;

const DAY_MS = 86_400_000;

/** Le dernier instant où le lien mène à la commande (minuit de Paris, J+90). */
export function guestLinkExpiresAt(serviceDay: string | null, placedAt: Date): Date {
  if (serviceDay !== null) {
    const expiry = localToInstant(
      addDays(serviceDay, GUEST_CANCELLATION_LINK_LIFETIME_DAYS),
      "00:00",
    );
    if (expiry !== null) {
      return expiry;
    }
  }
  return new Date(placedAt.getTime() + GUEST_CANCELLATION_LINK_LIFETIME_DAYS * DAY_MS);
}

/** Le lien est-il encore vivant à `now` ? */
export function guestLinkIsLive(serviceDay: string | null, placedAt: Date, now: Date): boolean {
  return now.getTime() <= guestLinkExpiresAt(serviceDay, placedAt).getTime();
}
