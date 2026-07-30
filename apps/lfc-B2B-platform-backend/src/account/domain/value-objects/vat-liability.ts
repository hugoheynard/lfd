/**
 * Règle **domaine** : une forme juridique impose-t-elle un numéro de TVA
 * intracommunautaire ?
 *
 * Décision (Hugo) : on **dérive de la forme juridique** plutôt que de capter un
 * régime fiscal explicite. Les **sociétés** (SAS, SARL, SA…) sont assujetties ;
 * les **entreprises individuelles / micro / auto-entrepreneurs** ne le sont pas
 * par défaut (franchise en base). Approximation assumée — on affinera avec un
 * vrai régime fiscal si un cas déborde.
 *
 * Le backend est le **seul** propriétaire de cette règle ; il expose un booléen
 * (`vatNumberRequired`) dans la vue `/me`, le front ne la duplique pas.
 */

/** Formes NON assujetties par défaut (franchise en base) — tout le reste l'est. */
const NON_LIABLE_MARKERS = [
  "micro",
  "micro-entreprise",
  "auto-entrepreneur",
  "auto entrepreneur",
  "autoentrepreneur",
  "ei", // entreprise individuelle
  "entreprise individuelle",
  "eirl",
];

/** Minuscule + espaces normalisés ; les marqueurs sont ASCII, pas d'accent à retirer. */
function normalise(formeJuridique: string): string {
  return formeJuridique.trim().replace(/\s+/gu, " ").toLowerCase();
}

/**
 * `true` si la forme juridique impose un numéro de TVA intracommunautaire.
 *
 * Inconnu ⇒ `true` : mieux vaut **inviter** à renseigner la TVA (l'onboarding le
 * signalera) que la laisser manquer en silence pour une société assujettie.
 */
export function requiresVatNumber(formeJuridique: string): boolean {
  const value = normalise(formeJuridique);
  if (value === "") {
    return true;
  }
  return !NON_LIABLE_MARKERS.includes(value);
}
