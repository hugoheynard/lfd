/**
 * Une personne à qui l'accès a été ouvert et qui n'a **jamais posé de mot de
 * passe** (miroir de `PendingAccessView` — `GET /admin/access-pending`).
 */
export interface PendingAccess {
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  /** `null` pour un membre de l'équipe : il n'appartient à aucune société. */
  readonly companyId: string | null;
  /** La société, ou la fonction côté staff — ce qui situe la personne. */
  readonly companyName: string;
  readonly invitedAt: string;
  /**
   * De quel annuaire vient la ligne.
   *
   * Les deux files restent SÉPARÉES côté serveur (deux tables, deux murs) et se
   * rejoignent seulement ici, à l'affichage : c'est le même geste pour le même
   * humain. Le drapeau dit à qui adresser la demande de lien.
   */
  readonly kind: 'client' | 'staff';
}

/** Le nom de la personne, ou son adresse à défaut — on ne montre jamais un vide. */
export function displayName(person: PendingAccess): string {
  const full = `${person.firstName} ${person.lastName}`.trim();
  return full === '' ? person.email : full;
}

/**
 * « attend depuis 12 jours ». C'est l'ancienneté qui fait agir, pas la ligne.
 */
export function waitingFor(invitedAt: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(invitedAt).getTime()) / 86_400_000);
  if (days <= 0) {
    return "depuis aujourd'hui";
  }
  return days === 1 ? 'depuis hier' : `depuis ${days} jours`;
}

/**
 * « valable jusqu'au lundi 21 août » — dite au moment de la copie, parce que
 * c'est là qu'elle sert : un lien copié un mardi et envoyé le lundi suivant
 * enverrait une erreur, et le commercial doit le savoir avant de coller, pas
 * quand le client se plaint.
 *
 * Le jour et non l'heure : personne ne colle un lien à la minute près, et une
 * heure affichée ferait croire à une précision que le geste n'a pas.
 */
export function validUntil(expiresAt: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(expiresAt));
}
