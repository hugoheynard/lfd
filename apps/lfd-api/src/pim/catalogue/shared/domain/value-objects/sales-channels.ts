/**
 * Un canal **vendu** : un contexte, et le lieu depuis lequel il se vend.
 *
 * `locationId === null` = contexte **sans lieu** (le B2B aujourd'hui). Ce n'est
 * pas une absence de donnée, c'est la donnée : on ne commande pas le B2B à une
 * boutique.
 */
export interface SoldChannel {
  readonly locationId: string | null;
  readonly context: string;
}

/**
 * Où et comment une gamme se vend — un **ensemble de paires**.
 *
 * ## Ce que cette forme a remplacé
 *
 * C'était deux cartes imbriquées : `{ boutiques: Record<locationId, { emporter,
 * surPlace }>, b2b: boolean }`. Les emplacements y étaient deja une donnée
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
  return `${channel.locationId ?? ""} ${channel.context}`;
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
    seen.set(keyOf(channel), { locationId: channel.locationId, context: channel.context });
  }
  return [...seen.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

/**
 * Ce contexte est-il vendu **quelque part** ?
 *
 * Aucune branche, et c'est tout l'intérêt : la fonction ne sait pas lequel des
 * contextes a besoin d'un lieu, ni lequel est le B2B. Elle ne connaît aucun nom.
 */
export function sellsContext(channels: SalesChannels, contextKey: string): boolean {
  return channels.some((channel) => channel.context === contextKey);
}

/** Les identifiants d'emplacement cités — sans doublon, contextes globaux exclus. */
export function referencedLocations(channels: SalesChannels): string[] {
  const ids = new Set<string>();
  for (const channel of channels) {
    if (channel.locationId !== null) {
      ids.add(channel.locationId);
    }
  }
  return [...ids];
}

/** Les contextes vendus, sans doublon — ce que la fiche projette. */
export function soldContexts(channels: SalesChannels): string[] {
  return [...new Set(channels.map((channel) => channel.context))];
}

/** Ce lieu vend-il ce contexte ? La question de l'écran, case par case. */
export function sellsAt(
  channels: SalesChannels,
  locationId: string | null,
  contextKey: string,
): boolean {
  return channels.some(
    (channel) => channel.locationId === locationId && channel.context === contextKey,
  );
}
