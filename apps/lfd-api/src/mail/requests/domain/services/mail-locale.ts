/**
 * La langue d'un e-mail, lue dans les données du modèle.
 *
 * La plupart des modèles de `B2bMails` portent `locale` dans leurs données ;
 * certains (e-mails du staff) n'en portent pas et partent en français. On ne
 * l'invente pas : `null` dit « le modèle ne déclare pas de langue », et la
 * demande ne la recopie pas dans un second champ qui pourrait la contredire.
 */
export function mailLocaleOf(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("locale" in data)) {
    return null;
  }
  return typeof data.locale === "string" ? data.locale : null;
}
