/**
 * **Un stockage du navigateur qui ne quitte pas la mémoire** — la forme de
 * `Storage`, sans rien écrire sur le disque (plan
 * `plan-textes-de-la-boutique.md`, §10 B3).
 *
 * La boutique lit et écrit son stockage local par le port `client/local-store.ts`,
 * et quelques fichiers le touchent encore en direct (connexion, espace pro).
 * Plutôt que de les injecter un par un, l'aperçu REMPLACE `localStorage` et
 * `sessionStorage` sur `window`, avant que le moindre module de la boutique ne
 * s'exécute : le port, les accès directs et tout code tiers lisent alors ce
 * stockage-ci — ce qui n'est pas remplacé ne peut pas fuir.
 */
export class MemoryStorage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

/** Les deux stockages de l'aperçu, vidés à chaque parcours rejoué. */
export interface PreviewStorages {
  readonly local: MemoryStorage;
  readonly session: MemoryStorage;
}

/**
 * Pose les deux stockages en mémoire sur la fenêtre. À appeler AVANT tout
 * import de la boutique qui lirait le stockage au chargement du module.
 *
 * `configurable` reste vrai : les suites de tests le reposent à chaque cas.
 */
export function shadowBrowserStorage(target: Window): PreviewStorages {
  const storages: PreviewStorages = { local: new MemoryStorage(), session: new MemoryStorage() };
  Object.defineProperty(target, 'localStorage', {
    configurable: true,
    get: () => storages.local,
  });
  Object.defineProperty(target, 'sessionStorage', {
    configurable: true,
    get: () => storages.session,
  });
  return storages;
}
