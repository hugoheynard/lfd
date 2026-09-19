/**
 * **Qui a fait le geste, tel qu'un humain le lit.**
 *
 * Chaque vue qui sert un auteur staff porte deux champs : l'identifiant tel
 * qu'écrit (`createdBy`, `takenBy`… — un `sub` Auth0 ou un id de fiche) et son
 * nom résolu au serveur (`createdByName`…). Plan :
 * `documentation/journalisation/architecture-journalisation.md` §12, D3.
 *
 * Le nom vaut `null` quand la valeur ne désigne **aucune fiche** : un marqueur
 * (`seed-pim`, `sonde`, `system`) ou un `sub` jamais lié. On affiche alors la
 * valeur brute, comme avant — elle dit ce qu'on sait, et rien n'est inventé.
 */
export function staffAuthor(raw: string, name: string | null): string;
export function staffAuthor(raw: string | null, name: string | null): string | null;
export function staffAuthor(raw: string | null, name: string | null): string | null {
  return name ?? raw;
}
