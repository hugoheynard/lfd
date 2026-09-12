import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FoldCalloutComponent, FoldPageLayoutComponent } from 'fold-ng';

import { declarePimAgentTools } from '../pim-agent-tools';

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
   * Les noms déclarés — rendus par la déclaration elle-même, jamais recopiés.
   *
   * Une liste écrite à la main dans le gabarit finirait par mentir : elle
   * survivrait à un outil supprimé, et l'écran annoncerait une capacité absente.
   */
  protected readonly tools = signal<readonly string[]>(declarePimAgentTools());

  /**
   * Y a-t-il un agent branché ?
   *
   * `in` plutôt qu'un accès typé : `modelContext` n'existe pas dans la
   * bibliothèque DOM de TypeScript, et le dépôt refuse les casts.
   */
  protected readonly bridged = computed(
    () => 'modelContext' in document || 'modelContext' in navigator,
  );
}
