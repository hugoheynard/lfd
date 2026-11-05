import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';

import type { WorkspaceWriteOutcome } from '../account/account.service';
import { AuthFacade } from '../auth/auth.facade';
import { LoginMoment } from '../auth/login-moment';
import { ClientWorkspace } from './client-workspace.service';
import { readLocal, readString, writeLocal } from './local-store';

/**
 * La clé de l'espace retenu (lot e) — `lfc.workspace-hint` dans le stockage.
 * Effacée à la déconnexion (`sign-out/stored-keys.ts`), inscrite au registre
 * des traceurs.
 */
export const WORKSPACE_HINT_KEY = 'workspace-hint';

/**
 * Le préfixe d'un lecteur anonyme : les routes publiques, les tarifs des particuliers.
 *
 * Une VALEUR de clé de rangement, partagée par plusieurs stores : elle ne se
 * renomme pas avec les sortes d'état.
 */
export const VISITOR = 'visiteur';

/**
 * Le contexte dans lequel la boutique lit ce qui dépend de l'audience.
 *
 * - `unknown` : la personne est reconnue, mais `/me` n'a pas encore dit son
 *   espace — un lecteur par espace ATTEND ;
 * - `visitor` : pas de session, les routes publiques ;
 * - `switching` : un autre espace est demandé (`to`) et le serveur ne l'a pas
 *   encore accepté — on MONTRE encore `from`, on lit déjà `to` (cf.
 *   {@link ClientContext.ahead}) ; `from` vaut `null` à l'arrivée pro d'une
 *   connexion (rien à quitter) ;
 * - `trying` : au DÉMARRAGE seulement, la personne est reconnue, `/me` n'a pas
 *   répondu, et le navigateur retient l'espace de la dernière visite (`hint`) —
 *   rien ne s'affiche, mais les lecteurs y lisent d'avance (lot e) ;
 * - `confirmed` : l'espace accepté de la personne reconnue.
 */
export type ClientContextState =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'trying'; readonly hint: string }
  | { readonly kind: 'visitor' }
  | { readonly kind: 'switching'; readonly from: string | null; readonly to: string }
  | { readonly kind: 'confirmed'; readonly workspace: string };

const UNKNOWN: ClientContextState = { kind: 'unknown' };
const VISITING: ClientContextState = { kind: 'visitor' };

/**
 * **Le contexte de lecture, en un seul endroit** (lot b du plan
 * `documentation/caching-usage/plan-espace-retenu.md`, §00 bis).
 *
 * Chaque lecteur par audience recopiait la même règle — « visiteur sans
 * session, sinon l'espace, sinon on attend » — et chaque copie était un
 * endroit où l'espace retenu (lot e) devrait être réappris. Ici, la règle
 * s'écrit une fois ; les stores composent leur clé à partir de
 * {@link prefix}, plus ce qui leur est propre (la visite pro, le rayon…).
 *
 * **La bascule est une étape nommée** (lot c) : `confirmed` veut dire
 * « accepté par le serveur ». L'écriture de préférence reste optimiste dans
 * `AccountService` — `ClientWorkspace.current()` vaut déjà la cible, et
 * l'intercepteur la pose sur les relectures des stores pas encore migrés
 * (lot d), comme avant.
 *
 * Deux clés pendant la bascule, et c'est tout le geste :
 * - {@link prefix} garde `from` : c'est la seule que l'écran montre ;
 * - {@link ahead} vaut `to` : les lecteurs y lisent DÉJÀ, rangé sous `to`,
 *   pour que l'acceptation trouve la donnée prête au lieu d'enchaîner PATCH
 *   puis lecture.
 * Un lecteur pose donc LUI-MÊME l'en-tête d'espace de la clé qu'il lit — le
 * même intercepteur poserait `to` sur une lecture de `from`. Un refus ramène
 * à `from`, et {@link whenAbandoned} fait jeter ce qui a été lu pour `to`,
 * sans l'avoir montré.
 *
 * **L'espace retenu est une lecture d'avance de plus** (lot e) : au
 * démarrage, entre la session reconnue et la réponse de `/me`, l'état vaut
 * `trying`, {@link prefix} reste `null` (rien ne s'affiche) et {@link ahead}
 * vaut l'espace de la dernière visite. `/me` tient le rôle du `PATCH` : même
 * espace, ce qui a été lu sert tel quel ; autre espace, {@link whenAbandoned}
 * le fait jeter. Jamais au retour d'une connexion (`LoginMoment.fresh()` —
 * l'arrivée pro rebascule juste après `/me`), jamais sans session ni indice,
 * jamais au rendu serveur (l'indice ne s'y lit pas, l'état reste `unknown`).
 * L'indice s'écrit à chaque état `confirmed` : après `/me`, et après une
 * bascule acceptée.
 */
@Injectable({ providedIn: 'root' })
export class ClientContext {
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);
  private readonly loginMoment = inject(LoginMoment);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * L'espace de la dernière visite, lu une fois au démarrage ; `null` dès le
   * premier espace confirmé — l'essai ne vaut qu'au démarrage.
   */
  private readonly hint = signal<string | null>(this.browser ? readHint() : null);

  readonly state = computed<ClientContextState>(
    () => {
      if (!this.auth.isAuthenticated()) {
        return VISITING;
      }
      const workspace = this.workspace.current();
      if (workspace === null) {
        const hint = this.hint();
        return hint === null || this.loginMoment.fresh() ? UNKNOWN : { kind: 'trying', hint };
      }
      const switching = this.workspace.switching();
      return switching === null
        ? { kind: 'confirmed', workspace }
        : { kind: 'switching', from: switching.from, to: switching.to };
    },
    // Un même espace relu ne doit pas réveiller les lecteurs.
    { equal: (a, b) => identityOf(a) === identityOf(b) },
  );

  /**
   * {@link VISITOR}, l'espace, ou `null` tant qu'il est inconnu : la part de
   * clé que tout lecteur par audience partage, et la seule qui s'AFFICHE.
   */
  readonly prefix = computed<string | null>(() => prefixOf(this.state()));

  /**
   * L'espace demandé et pas encore accepté — à lire d'avance, jamais à
   * montrer : la cible d'une bascule, ou l'espace retenu pendant l'essai.
   */
  readonly ahead = computed<string | null>(() => {
    const state = this.state();
    switch (state.kind) {
      case 'switching':
        return state.to;
      case 'trying':
        return state.hint;
      default:
        return null;
    }
  });

  /**
   * Une bascule attend-elle le serveur ? De quoi dire « on change d'espace »
   * sans rien en montrer. Faux pendant l'essai : personne n'a rien demandé.
   */
  readonly switching = computed<boolean>(() => this.state().kind === 'switching');

  constructor() {
    // Retenir l'espace confirmé — par `/me` ou par le serveur à la bascule —
    // pour la prochaine visite, et clore l'essai du démarrage.
    effect(() => {
      const state = this.state();
      if (state.kind !== 'confirmed') {
        return;
      }
      untracked(() => {
        this.hint.set(null);
        if (this.browser) {
          writeLocal(WORKSPACE_HINT_KEY, state.workspace);
        }
      });
    });
  }

  /**
   * **Le point d'entrée unique de la bascule.** L'espace demandé passe en
   * `switching` tout de suite, et en `confirmed` quand le serveur l'accepte ;
   * un refus revient à l'espace d'avant (avec le toast de l'écriture).
   *
   * @returns l'issue — seule `accepted` doit faire suivre l'écran : une
   * bascule remplacée par une plus récente laisse la dernière décider.
   */
  switchTo(workspace: string): Promise<WorkspaceWriteOutcome> {
    return this.workspace.choose(workspace);
  }

  /**
   * Appelle `forget(espace)` quand un espace lu d'avance ne sera pas montré :
   * refusé, ou remplacé par une bascule plus récente. À appeler dans un
   * contexte d'injection (le constructeur d'un store).
   *
   * Un espace accepté n'est pas abandonné : il devient {@link prefix}, et ce
   * qui a été lu pour lui sert tel quel.
   */
  whenAbandoned(forget: (workspace: string) => void): void {
    let previous: string | null = null;
    effect(() => {
      const ahead = this.ahead();
      const shown = this.prefix();
      const left = previous;
      previous = ahead;
      if (left !== null && left !== ahead && left !== shown) {
        untracked(() => {
          forget(left);
        });
      }
    });
  }
}

/** Ce qui distingue deux états pour un lecteur : la sorte, le préfixe, la cible d'une bascule. */
function identityOf(state: ClientContextState): string {
  const to = state.kind === 'switching' ? state.to : state.kind === 'trying' ? state.hint : '';
  return `${state.kind}\u0000${prefixOf(state) ?? ''}\u0000${to}`;
}

function prefixOf(state: ClientContextState): string | null {
  switch (state.kind) {
    case 'visitor':
      return VISITOR;
    case 'confirmed':
      return state.workspace;
    case 'switching':
      return state.from;
    case 'unknown':
    case 'trying':
      return null;
  }
}

/** L'espace retenu, s'il a la forme d'un espace. */
function readHint(): string | null {
  return readLocal(WORKSPACE_HINT_KEY, (raw) => {
    const hint = readString(raw);
    return hint === null || hint.trim() === '' ? null : hint;
  });
}
