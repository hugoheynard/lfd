/**
 * Une personne à qui l'accès a été ouvert et qui n'a **jamais posé de mot de
 * passe** (miroir de `PendingAccessView` — `GET /admin/access-pending`).
 */
export interface PendingAccess {
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly invitedAt: string;
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
