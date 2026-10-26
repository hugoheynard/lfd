import type { PublicOrderOpeningView } from '@lfd/contracts';

/** Ce que l'encadré d'en-tête dit d'une boutique fermée. */
export interface ClosureNotice {
  readonly title: string;
  readonly body: string;
  readonly exemptions: string;
}

/**
 * **L'état de fermeture, en clair** (décision de Hugo du 2026-10-26) : à qui
 * la boutique est fermée, ce que ça veut dire, et combien d'exemptions jouent.
 * `null` quand tout est ouvert — l'écran ne dit alors rien.
 *
 * Pur, sans Angular : la phrase se teste sans monter la page.
 */
export function closureNotice(
  opening: PublicOrderOpeningView,
  activeExemptions: number,
): ClosureNotice | null {
  const { ordersOpenToB2b: b2b, ordersOpenToB2c: b2c } = opening;
  if (b2b && b2c) {
    return null;
  }
  const who = !b2b && !b2c ? 'à tous' : !b2b ? 'aux pros' : 'aux particuliers';
  const refused =
    !b2b && !b2c
      ? 'toutes les commandes'
      : `les commandes ${!b2b ? 'des pros' : 'des particuliers'}`;
  return {
    title: `La boutique est fermée ${who}`,
    body: `Le catalogue et les prix restent visibles, mais ${refused} passées depuis la boutique sont refusées. Les commandes déjà passées ne changent pas, et l’équipe peut toujours saisir une commande.`,
    exemptions: exemptionsSentence(activeExemptions),
  };
}

function exemptionsSentence(count: number): string {
  if (count === 0) {
    return 'Aucune exemption active : personne de cette clientèle ne peut commander.';
  }
  return count === 1
    ? '1 exemption active : ce client peut commander quand même.'
    : `${String(count)} exemptions actives : ces clients peuvent commander quand même.`;
}
