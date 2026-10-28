import type { ContentLocale } from "@lfd/contracts";

/**
 * « mardi 13 octobre » — le jour de service, qui n'a ni heure ni fuseau : il
 * est lu et écrit en UTC, sans quoi un serveur à l'ouest le reculerait d'un
 * jour. `null` sur une commande sans jour, ou d'un jour illisible.
 *
 * Partagé par l'annulation et la confirmation : deux e-mails qui disent le
 * même jour doivent le dire de la même façon.
 */
export function dayInWords(requestedFor: string | null, locale: ContentLocale): string | null {
  if (requestedFor === null) {
    return null;
  }
  const date = new Date(`${requestedFor.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}
