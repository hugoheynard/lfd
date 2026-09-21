import { Injectable, signal, type Signal } from '@angular/core';

/**
 * Les **comptes épinglés** du tableau de bord, et les indicateurs choisis pour
 * chacun.
 *
 * **Stockés dans le navigateur, pas sur le serveur**, et c'est un choix daté :
 * une préférence par personne suppose une personne, or le login staff n'est pas
 * branché (tout le monde est `dev-staff` derrière le bypass). Persister
 * aujourd'hui côté serveur reviendrait à écrire les épingles de tout le monde
 * dans la même ligne.
 *
 * Le jour où l'identité staff existe, ce magasin devient un adaptateur : même
 * API, une écriture réseau derrière. C'est pour ça que la page ne touche jamais
 * `localStorage` elle-même.
 *
 * SSR : `localStorage` n'existe pas côté serveur. On lit **paresseusement**, au
 * premier accès dans le navigateur, et on n'écrit jamais sans l'avoir vérifié.
 */

const STORAGE_KEY = 'lfc.admin.cockpit.pinned';
/** Au-delà, ce n'est plus un épinglage mais une seconde liste de comptes. */
export const MAX_PINNED = 6;
/** Au-delà, la carte n'est plus une carte mais un tableau mal déguisé. */
export const MAX_METRICS = 4;

/** Un compte suivi : son identifiant, et ce qu'on veut en voir. */
export interface PinnedAccount {
  readonly companyId: string;
  /** Clés du catalogue d'indicateurs, dans l'ordre d'ajout. */
  readonly metrics: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class PinnedAccountsStore {
  private readonly accounts = signal<readonly PinnedAccount[]>(read());

  /** Les comptes suivis, dans l'ordre où ils ont été épinglés. */
  get pinned(): Signal<readonly PinnedAccount[]> {
    return this.accounts.asReadonly();
  }

  isPinned(companyId: string): boolean {
    return this.accounts().some((account) => account.companyId === companyId);
  }

  /** Les indicateurs d'un compte — vide s'il n'est pas suivi. */
  metricsOf(companyId: string): readonly string[] {
    return this.accounts().find((account) => account.companyId === companyId)?.metrics ?? [];
  }

  /**
   * Épingle ou retire. Rend `false` quand la limite est atteinte — l'appelant
   * peut alors le dire, plutôt que de voir son clic ignoré sans explication.
   */
  toggle(companyId: string): boolean {
    const current = this.accounts();
    if (this.isPinned(companyId)) {
      this.write(current.filter((account) => account.companyId !== companyId));
      return true;
    }
    if (current.length >= MAX_PINNED) {
      return false;
    }
    this.write([...current, { companyId, metrics: [] }]);
    return true;
  }

  /** Ajoute un indicateur à un compte. `false` si la carte est déjà pleine. */
  addMetric(companyId: string, metric: string): boolean {
    const account = this.accounts().find((entry) => entry.companyId === companyId);
    if (account === undefined || account.metrics.includes(metric)) {
      return false;
    }
    if (account.metrics.length >= MAX_METRICS) {
      return false;
    }
    this.replace(companyId, [...account.metrics, metric]);
    return true;
  }

  removeMetric(companyId: string, metric: string): void {
    const account = this.accounts().find((entry) => entry.companyId === companyId);
    if (account === undefined) {
      return;
    }
    this.replace(
      companyId,
      account.metrics.filter((key) => key !== metric),
    );
  }

  private replace(companyId: string, metrics: readonly string[]): void {
    this.write(
      this.accounts().map((account) =>
        account.companyId === companyId ? { companyId, metrics } : account,
      ),
    );
  }

  private write(next: readonly PinnedAccount[]): void {
    this.accounts.set(next);
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota plein ou stockage refusé : l'épinglage reste vrai pour la session.
    }
  }
}

/**
 * Lit ce qui est stocké, en se méfiant : un JSON étranger ne doit rien casser.
 *
 * Deux formes acceptées — l'ancienne (`["cmp_1"]`, avant les indicateurs) et la
 * nouvelle. Un utilisateur qui avait déjà épinglé des comptes les retrouve, sans
 * migration à écrire ni épingles perdues.
 */
function read(): readonly PinnedAccount[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(toAccount)
      .filter((account): account is PinnedAccount => account !== null)
      .slice(0, MAX_PINNED);
  } catch {
    return [];
  }
}

/** Une entrée stockée → un compte, quelle que soit la forme d'origine. */
function toAccount(entry: unknown): PinnedAccount | null {
  if (typeof entry === 'string') {
    return { companyId: entry, metrics: [] };
  }
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }
  const companyId: unknown = Reflect.get(entry, 'companyId');
  if (typeof companyId !== 'string' || companyId === '') {
    return null;
  }
  const metrics: unknown = Reflect.get(entry, 'metrics');
  return {
    companyId,
    metrics: Array.isArray(metrics)
      ? metrics.filter((key): key is string => typeof key === 'string').slice(0, MAX_METRICS)
      : [],
  };
}
