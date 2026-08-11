import type { AdminCompany } from './admin-company';

/**
 * La **recherche d'un compte** : société, SIRET, ou propriétaire de l'espace.
 *
 * Trois champs parce que le commercial arrive par trois chemins — il a le nom en
 * tête, il lit un SIRET sur un document, ou il a au téléphone la personne qui
 * administre l'espace. Chercher dans un seul de ces champs obligerait à savoir
 * d'avance dans lequel on cherche.
 *
 * Pur et testable : une fonction, aucune dépendance Angular.
 */
export function matchesCompanySearch(company: AdminCompany, query: string): boolean {
  const needle = normalise(query);
  if (needle === '') {
    return true;
  }
  // Un SIRET se lit par groupes de chiffres, se dicte avec des espaces, et se
  // recopie parfois avec. On compare donc les chiffres seuls, dès que la saisie
  // en contient — sans quoi « 812 345 » ne trouverait jamais « 81234567800019 ».
  const digits = query.replace(/\D/g, '');
  if (digits !== '' && company.siret.replace(/\D/g, '').includes(digits)) {
    return true;
  }
  return haystack(company).some((field) => field.includes(needle));
}

/** Les champs cherchés, dans l'ordre où ils ont une chance de répondre. */
function haystack(company: AdminCompany): string[] {
  const owner = company.owner;
  return [
    normalise(company.raisonSociale),
    // L'enseigne est le nom SOUS LEQUEL le client se présente au téléphone ;
    // la raison sociale est celle qui est écrite sur les papiers. Chercher l'un
    // sans l'autre, c'est rater la moitié des appels.
    normalise(company.enseigne),
    normalise(company.reference),
    owner === null ? '' : normalise(`${owner.firstName} ${owner.lastName}`),
    owner === null ? '' : normalise(owner.email),
  ].filter((field) => field !== '');
}

/**
 * Minuscules **sans accents** : on tape « Perrin » pour trouver « Périn », et
 * personne ne va chercher la bonne touche morte pour retrouver un client.
 */
function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
