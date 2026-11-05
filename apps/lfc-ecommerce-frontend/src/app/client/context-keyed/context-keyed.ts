import { inject, Injectable } from '@angular/core';
// Par le sous-chemin sans zod : les lecteurs sont chargés au démarrage.
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import type { Observable, Subscription } from 'rxjs';

import { ClientContext, VISITOR } from '../client-context.service';

/**
 * La clé complète d'une lecture : l'espace du {@link ClientContext} (ou
 * {@link VISITOR}) et la part propre au lecteur (rayon, jour…, `''` si rien).
 */
export interface ContextKey {
  readonly workspace: string;
  readonly own: string;
}

/** Une lecture coupée parce que personne ne la montrera plus. */
export class ContextReadAbandoned extends Error {
  constructor() {
    super('Lecture abandonnée : son espace ne sera pas montré.');
    this.name = 'ContextReadAbandoned';
  }
}

/**
 * L'en-tête d'espace d'une lecture, tiré de SA clé — jamais de l'espace
 * courant à l'envoi, qui vaut déjà la cible pendant une bascule. Un visiteur
 * n'en porte aucun, et l'intercepteur n'en ajoute pas : une clé visiteur ne
 * se lit que sans session, où `ClientWorkspace.current()` vaut `null`
 * (vérifié le 2026-11-05 — d'où l'absence d'un marqueur « sans espace »).
 */
export function workspaceHeadersOf(key: ContextKey): Record<string, string> {
  return key.workspace === VISITOR ? {} : { [WORKSPACE_HEADER]: key.workspace };
}

/** Ce que la déconnexion vide. */
interface Forgettable {
  clear(): void;
}

/**
 * **La mémoire de toutes les briques**, que l'oubli à la déconnexion vide
 * (`sign-out/sign-out-forgetting.ts`) : sans quoi les points ou le tarif d'un
 * espace resteraient lisibles en mémoire après la sortie (plan
 * `caching-usage/plan-espace-retenu.md`, § 00 ter, contredit par `vitruve`).
 */
@Injectable({ providedIn: 'root' })
export class ContextKeyedMemory {
  private readonly held = new Set<Forgettable>();

  register(keyed: Forgettable): void {
    this.held.add(keyed);
  }

  clear(): void {
    for (const keyed of this.held) {
      keyed.clear();
    }
  }
}

interface Entry<T> {
  readonly key: ContextKey;
  /** La dernière valeur servie pour CETTE clé : gardée pendant une relecture. */
  value?: T;
  /** La lecture faite d'avance, rendue une fois à qui la redemande. */
  ahead?: Promise<T>;
}

/** Ce que la brique lit du contexte : la clé qui s'affiche (`ClientContext.prefix`). */
export interface ShownPrefix {
  prefix(): string | null;
}

interface InFlight {
  readonly workspace: string;
  abandon(): void;
}

/**
 * **La brique de lecture rangée par clé de contexte** (lot c bis du plan
 * `documentation/caching-usage/plan-espace-retenu.md`, version réduite après
 * `vitruve`). Écrite à la main : `resource()` jette sa valeur à chaque
 * changement de paramètres, et `httpResource` ne sait pas attendre le jeton.
 *
 * Elle tient les règles que chaque store recopiait :
 *
 * - **une table par clé complète** ({@link ContextKey}) ;
 * - **le périmé ne vaut que pour la même clé** ({@link held}), et rien n'est
 *   rendu pour une autre clé de contexte que celle qui s'affiche
 *   ({@link shown}, contre `ClientContext.prefix()`) ;
 * - **la lecture d'avance est la sienne** : {@link ahead} remplace
 *   `AheadReads` pour un lecteur migré — même rangement (rendue une fois, à
 *   {@link read}), et `ClientContext.whenAbandoned` la jette et la COUPE
 *   ({@link forget}) ;
 * - **la déconnexion la vide** ({@link ContextKeyedMemory}).
 *
 * L'en-tête d'espace est posé par `load`, depuis la clé
 * ({@link workspaceHeadersOf}). Une lecture coupée rejette
 * {@link ContextReadAbandoned} ; une lecture d'avance sans preneur ne remonte
 * pas d'erreur non traitée.
 */
export class ContextKeyed<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly inFlight = new Set<InFlight>();

  constructor(
    private readonly context: ShownPrefix,
    private readonly load: (key: ContextKey) => Observable<T>,
  ) {}

  /** Lance d'avance la lecture de cette clé, si elle ne l'est pas déjà. */
  ahead(key: ContextKey): void {
    const entry = this.entryOf(key);
    if (entry.ahead !== undefined) {
      return;
    }
    const pending = this.fetch(key);
    // Sans preneur, un rejet ne doit pas remonter comme une erreur non traitée.
    pending.catch(() => undefined);
    entry.ahead = pending;
  }

  /** La lecture de cette clé : reprise de la lecture d'avance, sinon lancée. */
  read(key: ContextKey): Promise<T> {
    const entry = this.entryOf(key);
    const ahead = entry.ahead;
    if (ahead !== undefined) {
      delete entry.ahead;
      return ahead;
    }
    return this.fetch(key);
  }

  /** La dernière valeur lue pour CETTE clé, même périmée, ou `undefined`. */
  held(key: ContextKey): T | undefined {
    return this.entries.get(idOf(key))?.value;
  }

  /** {@link held}, seulement si sa clé est celle que le contexte affiche. */
  shown(key: ContextKey): T | undefined {
    return key.workspace === this.context.prefix() ? this.held(key) : undefined;
  }

  /** Jette et coupe ce qui a été lu pour un espace qui ne sera pas montré. */
  forget(workspace: string): void {
    for (const [id, entry] of this.entries) {
      if (entry.key.workspace === workspace) {
        this.entries.delete(id);
      }
    }
    for (const flight of [...this.inFlight]) {
      if (flight.workspace === workspace) {
        flight.abandon();
      }
    }
  }

  /** Tout oublier, lectures en vol comprises — la déconnexion. */
  clear(): void {
    this.entries.clear();
    for (const flight of [...this.inFlight]) {
      flight.abandon();
    }
  }

  private entryOf(key: ContextKey): Entry<T> {
    const id = idOf(key);
    const existing = this.entries.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const entry: Entry<T> = { key };
    this.entries.set(id, entry);
    return entry;
  }

  private fetch(key: ContextKey): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let subscription: Subscription | null = null;
      let settled = false;
      const flight: InFlight = {
        workspace: key.workspace,
        abandon: () => {
          settled = true;
          this.inFlight.delete(flight);
          subscription?.unsubscribe();
          reject(new ContextReadAbandoned());
        },
      };
      const settle = (): void => {
        settled = true;
        this.inFlight.delete(flight);
      };
      this.inFlight.add(flight);
      // La première valeur fait la réponse, comme `firstValueFrom` : le jeton
      // vient d'un flux qui ne se termine pas forcément.
      subscription = this.load(key).subscribe({
        next: (value) => {
          if (settled) {
            return;
          }
          settle();
          subscription?.unsubscribe();
          // La valeur ne se range que sous une clé encore tenue : une clé
          // oubliée entre-temps n'a rien à garder.
          const entry = this.entries.get(idOf(key));
          if (entry !== undefined) {
            entry.value = value;
          }
          resolve(value);
        },
        error: (error: unknown) => {
          settle();
          reject(error);
        },
        complete: () => {
          if (!settled) {
            settle();
            reject(new Error('Lecture terminée sans réponse.'));
          }
        },
      });
      if (settled) {
        subscription.unsubscribe();
      }
    });
  }
}

/**
 * Une brique pour ce lecteur, reliée à `ClientContext.whenAbandoned` et à la
 * déconnexion. À appeler dans un contexte d'injection (le constructeur ou un
 * champ d'un service).
 */
export function contextKeyed<T>(load: (key: ContextKey) => Observable<T>): ContextKeyed<T> {
  const context = inject(ClientContext);
  const keyed = new ContextKeyed(context, load);
  context.whenAbandoned((workspace) => {
    keyed.forget(workspace);
  });
  inject(ContextKeyedMemory).register(keyed);
  return keyed;
}

function idOf(key: ContextKey): string {
  return `${key.workspace}\u0000${key.own}`;
}
