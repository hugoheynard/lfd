/**
 * Le stockage local de la maquette cliente — panier, mode de service, commandes
 * passées.
 *
 * ⚠️ DÉLIBÉRÉMENT côté navigateur. La démo doit pouvoir se jouer sans écrire une
 * ligne en base : ce qui s'y stocke est de la matière de démonstration, pas de
 * la donnée d'entreprise. L'AUTHENTIFICATION, elle, reste vraie — c'est la seule
 * chose qu'on ne peut pas simuler sans mentir sur ce qui est protégé.
 *
 * Trois précautions, et elles ne sont pas décoratives :
 *
 * 1. **Le rendu serveur n'a pas de `localStorage`.** Toute lecture le suppose
 *    absent et rend la valeur par défaut ; l'hydratation la remplace ensuite.
 * 2. **Un contenu illisible ne fait pas tomber l'écran.** Une clé corrompue à la
 *    main, ou laissée par une version antérieure, est traitée comme absente.
 * 3. **Le préfixe nomme le propriétaire** : `lfc.` — pour qu'un jour on sache
 *    quoi purger, et quoi laisser aux autres surfaces du domaine.
 */

const PREFIX = 'lfc.';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Un navigateur qui refuse le stockage (mode privé strict, cookies bloqués)
    // lève à l'ACCÈS, pas à l'écriture : la garde doit être ici.
    return null;
  }
}

/**
 * Ce qui est relu du stockage est du texte : il faut le VALIDER, pas le croire.
 * Le lecteur reçoit `unknown` et rend `null` s'il ne reconnaît pas sa forme.
 */
export function readLocal<T>(key: string, parse: (raw: unknown) => T | null): T | null {
  const store = storage();
  const text = store?.getItem(PREFIX + key) ?? null;
  if (text === null) {
    return null;
  }
  try {
    return parse(JSON.parse(text));
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: unknown): void {
  const store = storage();
  if (store === null) {
    return;
  }
  try {
    store.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota plein ou stockage refusé : la maquette continue en mémoire. Perdre
    // la persistance vaut mieux que perdre l'écran.
  }
}

export function clearLocal(key: string): void {
  storage()?.removeItem(PREFIX + key);
}

/** Les gardes de forme, partagés par les lecteurs ci-dessus. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
