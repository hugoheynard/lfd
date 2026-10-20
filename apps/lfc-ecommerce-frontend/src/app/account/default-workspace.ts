import type { CompanyView } from '@lfd/contracts';

/**
 * L'espace pro où entrer quand rien n'est choisi : la première société
 * ACTIVE dans l'ordre de `/me`, sinon la première tout court (un dossier en
 * attente reste un espace pro), `null` sans société.
 *
 * Plusieurs sociétés : la commerciale a laissé le choix (« si plusieurs
 * comptes pro je ne sais pas, choisis », 2026-10-20). Une société active
 * passe avant un dossier en attente, parce qu'on y commande.
 */
export function defaultProWorkspace(
  companies: readonly Pick<CompanyView, 'id' | 'status'>[],
): string | null {
  return (companies.find((company) => company.status === 'active') ?? companies[0])?.id ?? null;
}
