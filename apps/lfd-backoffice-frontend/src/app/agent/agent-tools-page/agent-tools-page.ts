import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  Injector,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { FoldCalloutComponent, FoldPageLayoutComponent } from 'fold-ng';

import { declarePimAgentTools } from '../pim-agent-tools';

/**
 * Cadence du sondage d'apparition d'un agent.
 *
 * Il n'existe **aucun événement** pour l'arrivée de `modelContext` : ni
 * `Object.defineProperty` observable, ni notification côté navigateur. Sonder
 * est donc la solution honnête, et une seconde est le compromis assumé — assez
 * court pour qu'on ne se demande pas si l'écran est cassé, assez long pour que
 * le coût soit nul. Le sondage S'ARRÊTE à la première détection : il n'y a pas
 * de timer qui tourne pour rien après l'armement.
 */
const AGENT_PROBE_INTERVAL_MS = 1_000;

/**
 * Y a-t-il vraiment un agent branché ?
 *
 * On reproduit **exactement** le test d'Angular (`declareExperimentalWebMcpTool` :
 * `document.modelContext ?? navigator.modelContext`, puis `registerTool` doit
 * être une fonction — lu dans `@angular/core` 22.1.2 le 2026-09-23). Un simple
 * `'modelContext' in document` serait vrai pour une propriété posée à
 * `undefined`, et l'écran annoncerait « armés » sur une trousse qu'Angular
 * vient de refuser d'enregistrer.
 *
 * `in` plutôt qu'un accès typé : `modelContext` n'existe pas dans la
 * bibliothèque DOM de TypeScript, et le dépôt refuse les casts.
 */
function agentIsBridged(): boolean {
  const holders: readonly object[] = [document, navigator];
  return holders.some((holder) => {
    if (!('modelContext' in holder)) {
      return false;
    }
    const context = holder.modelContext;
    return (
      typeof context === 'object' &&
      context !== null &&
      'registerTool' in context &&
      typeof context.registerTool === 'function'
    );
  });
}

/**
 * **Outils agent** — l'écran EST l'interrupteur.
 *
 * Les outils WebMCP du référentiel ne sont déclarés que par ce composant, donc
 * ils n'existent que tant que cette page est ouverte : `DestroyRef` les retire
 * en sortant (Angular annule le signal passé à `registerTool`).
 *
 * 🔴 C'est la seule protection, et elle est volontairement **visible** plutôt
 * que configurée. Un drapeau dans `angular.json` ou une variable
 * d'environnement se relit mal et ne rougit nulle part — aucune des portes du
 * dépôt ne lit `angular.json`. Un écran ouvert, lui, se constate.
 *
 * Les outils sont **inertes** tant que rien ne fournit `document.modelContext` :
 * `declareExperimentalWebMcpTool` sort immédiatement quand l'API manque. Aucun
 * navigateur ne la fournit aujourd'hui — cette page dit donc si elle est là.
 *
 * 🔴 **L'agent peut arriver APRÈS l'ouverture de la page**, et c'est même le cas
 * courant : on ouvre l'écran, puis l'assistant pose sa passerelle. La détection
 * était gelée à la construction (un `computed` sans dépendance de signal ne se
 * recalcule jamais), donc la bannière disait « Aucun agent branché » pour
 * toujours et rien ne s'enregistrait (rapporté le 2026-09-23). La page sonde
 * désormais, et **déclare au moment où l'agent apparaît**.
 */
@Component({
  selector: 'app-agent-tools-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldCalloutComponent],
  templateUrl: './agent-tools-page.html',
  styleUrl: './agent-tools-page.scss',
})
export class AgentToolsPage {
  /**
   * L'injecteur du COMPOSANT — capturé, parce que la déclaration tardive en a
   * besoin deux fois : `declarePimAgentTools()` appelle `inject()`, et Angular
   * y lit le `DestroyRef` qui retirera les outils en quittant la page. Passer
   * l'injecteur de la racine casserait l'invariant « page quittée = outils
   * retirés ».
   */
  private readonly injector = inject(Injector);

  /**
   * Les noms déclarés — rendus par la déclaration elle-même, jamais recopiés.
   *
   * Une liste écrite à la main dans le gabarit finirait par mentir : elle
   * survivrait à un outil supprimé, et l'écran annoncerait une capacité absente.
   */
  protected readonly tools = signal<readonly string[]>([]);

  /** Un agent est-il branché ? Un signal, puisque la réponse change. */
  protected readonly bridged = signal(false);

  /**
   * L'idempotence, et comment elle tient : ce drapeau passe à `true` au SEUL
   * endroit qui déclare devant un agent présent, et `arm()` sort aussitôt
   * ensuite. La déclaration d'ouverture, elle, n'enregistre rien — Angular sort
   * avant `registerTool` quand `modelContext` manque — donc la redéclarer à
   * l'arrivée de l'agent n'enregistre bien qu'une fois.
   */
  private armed = false;

  constructor() {
    // Déclaration d'ouverture : inerte sans agent, mais c'est elle qui rend les
    // noms à afficher. Sans agent, le comportement est celui d'avant, au
    // caractère près.
    this.tools.set(declarePimAgentTools());
    this.armed = agentIsBridged();
    this.bridged.set(this.armed);

    if (this.armed) {
      return;
    }

    const probe = setInterval(() => {
      if (this.arm()) {
        clearInterval(probe);
      }
    }, AGENT_PROBE_INTERVAL_MS);
    // Quitter la page arrête le sondage AUSSI quand aucun agent n'est jamais
    // venu : un timer d'écran fermé est une fuite, pas une veille.
    inject(DestroyRef).onDestroy(() => clearInterval(probe));
  }

  /** Déclare la trousse pour de bon. Rend `true` dès qu'il n'y a plus à sonder. */
  private arm(): boolean {
    if (this.armed) {
      return true;
    }
    if (!agentIsBridged()) {
      return false;
    }
    this.armed = true;
    this.tools.set(runInInjectionContext(this.injector, () => declarePimAgentTools()));
    this.bridged.set(true);
    return true;
  }
}
