/** Le nom d'une personne, ou `null` si son profil n'en porte pas — jamais son adresse. */
export function personLabel(person: {
  readonly firstName: string;
  readonly lastName: string;
}): string | null {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name === "" ? null : name;
}
