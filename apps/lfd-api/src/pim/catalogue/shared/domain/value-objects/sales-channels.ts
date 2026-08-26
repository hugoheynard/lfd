/**
 * Un canal **vendu** : un contexte, et le point de vente qui le vend.
 *
 * `pointOfSaleId` n'est **pas nullable**, et c'est le gain de tout le chantier.
 * C'était `locationId: string | null`, où `null` voulait dire « le B2B » — un
 * `NULL` porteur de sens, donc une ligne absente quelque part. La plateforme
 * professionnelle a désormais la sienne : tout canal se vend depuis un point de
 * vente, sans exception à retenir.
 */
export interface SoldChannel {
  readonly pointOfSaleId: string;
  readonly context: string;
}

/**
 * Où et comment une gamme se vend — un **ensemble de paires**.
 *
 * ## Ce que cette forme a remplacé
 *
 * C'était deux cartes imbriquées : `{ boutiques: Record<locationId, { emporter,
 * surPlace }>, b2b: boolean }`. Les emplacements y étaient déjà une donnée
 * (clé = identifiant), mais les **modes** étaient deux champs nommés et le B2B
 * un drapeau. Trois conséquences, toutes payées :
 *
 * - un quatrième contexte de vente était **impossible** — le registre écartait
 *   en silence toute ligne dont le canal n'était pas l'un des trois ;
 * - lire « ce contexte est-il vendu ? » demandait de savoir lequel des trois on
 *   regardait, donc une branche ;
 * - aucune clé étrangère ne pouvait porter la référence à un emplacement,
 *   enfouie dans du `jsonb` — il a fallu un registre à part pour tenir le mur.
 *
 * L'ensemble de paires supprime les trois d'un coup, et c'est **la forme même
 * de la table** qui les stocke (`category_channel`, `product_channel`).
 *
 * ## Une clé absente n'est pas un faux
 *
 * On n'écrit que ce qui est vendu. L'absence de paire EST la donnée — même
 * motif que « non réglé » pour les taux.
 */
export type SalesChannels = readonly SoldChannel[];

/** Rien n'est vendu tant qu'on ne l'a pas dit. */
export function emptySalesChannels(): SalesChannels {
  return [];
}

/** La même paire, deux fois écrite ? Une seule ligne. */
function keyOf(channel: SoldChannel): string {
  return `${channel.pointOfSaleId} ${channel.context}`;
}

/**
 * Barrière avant persistance : dédoublonne et **ordonne**.
 *
 * L'ordre n'a pas de sens métier ; il en a pour la COMPARAISON. Le journal
 * inscrit un avant/après, et deux ensembles identiques écrits dans un ordre
 * différent produiraient un « changement » que personne n'a fait.
 */
export function normalizeSalesChannels(channels: SalesChannels): SalesChannels {
  const seen = new Map<string, SoldChannel>();
  for (const channel of channels) {
    seen.set(keyOf(channel), {
      pointOfSaleId: channel.pointOfSaleId,
      context: channel.context,
    });
  }
  return [...seen.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

/**
 * Ce contexte est-il vendu **quelque part** ?
 *
 * Aucune branche, et c'est tout l'intérêt : la fonction ne connaît aucun nom de
 * contexte, et ne se demande plus lequel aurait besoin d'un lieu.
 */
export function sellsContext(channels: SalesChannels, contextKey: string): boolean {
  return channels.some((channel) => channel.context === contextKey);
}

/** Les points de vente cités, sans doublon. */
export function referencedPointsOfSale(channels: SalesChannels): string[] {
  return [...new Set(channels.map((channel) => channel.pointOfSaleId))];
}

/** Les contextes vendus, sans doublon — ce que la fiche projette. */
export function soldContexts(channels: SalesChannels): string[] {
  return [...new Set(channels.map((channel) => channel.context))];
}

/** Ce point de vente vend-il ce contexte ? La question de l'écran, case par case. */
export function sellsAt(
  channels: SalesChannels,
  pointOfSaleId: string,
  contextKey: string,
): boolean {
  return channels.some(
    (channel) => channel.pointOfSaleId === pointOfSaleId && channel.context === contextKey,
  );
}
