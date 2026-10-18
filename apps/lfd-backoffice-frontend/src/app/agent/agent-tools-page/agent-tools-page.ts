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

import { PermissionsStore } from '../../auth/permissions.store';
import { declareAccessAgentTools } from '../access-agent-tools';
import { declareCustomerAgentTools } from '../customer-agent-tools';
import { declareMediaAgentTools } from '../media-agent-tools';
import { declareOpsAgentTools } from '../ops-agent-tools';
import { declarePimAgentTools } from '../pim-agent-tools';
import { declareSuggestionAgentTools } from '../suggestion-agent-tools';
import { declareVehicleAgentTools } from '../vehicle-agent-tools';

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

  /**
   * La trousse de la médiathèque — vide sans `media_library:write` (celle du
   * référentiel, {@link tools}, est vide sans `pim_catalog:write`), le droit
   * que ses routes d'écriture opposent (`@AdminSurface("media_library")`).
   * Déclarer des outils que le serveur refuserait tous ferait apprendre la
   * règle par une suite d'échecs.
   */
  protected readonly mediaTools = signal<readonly string[]>([]);

  /**
   * La trousse de l'exploitation — vide sans `ops_health:read`, le droit que
   * toutes ses routes opposent (`@AdminSurface("ops_health")`). Elle ne fait
   * que lire : la carte de santé n'a pas de geste à prêter à un agent.
   */
  protected readonly opsTools = signal<readonly string[]>([]);

  /**
   * La trousse des comptes clients — vide sans `b2b_companies:read`, le droit
   * de la fiche client (`fiche-client.routes.ts`) et de ses routes
   * (`@AdminSurface("b2b_companies")`). Elle ne fait que lire (2026-10-12).
   */
  protected readonly customerTools = signal<readonly string[]>([]);

  /**
   * La trousse de la flotte (2026-10-14) — vide sans `delivery_settings:read`,
   * le droit de lecture de `admin/delivery/vehicles` ; ses outils d'écriture ne
   * sont déclarés qu'avec `delivery_settings:write`, celui que `POST`/`PUT`
   * opposent.
   */
  protected readonly vehicleTools = signal<readonly string[]>([]);

  /**
   * La trousse des droits (2026-10-15) — vide sans `staff_access:read`, le
   * droit de lecture des rôles et de l'annuaire ; ses outils d'écriture ne
   * sont déclarés qu'avec `staff_access:write`, et ils ont leur propre garde
   * (plan `plan-outils-agent-droits.md`).
   */
  protected readonly accessTools = signal<readonly string[]>([]);

  /**
   * La trousse des suggestions décidées (2026-10-18, RS1) — vide sans
   * `lfc_suggestions:read`, le droit de lecture de `admin/suggestions` ; ses
   * outils d'écriture ne sont déclarés qu'avec `lfc_suggestions:write`.
   */
  protected readonly suggestionTools = signal<readonly string[]>([]);

  /**
   * Lus une fois : la garde de la route a déjà chargé les permissions. Elle
   * laisse passer l'un des sept droits ; chaque trousse suit le sien, et la
   * page dit laquelle manque.
   */
  private readonly permissions = inject(PermissionsStore);
  protected readonly pimAllowed = this.permissions.can('pim_catalog:write');
  protected readonly reemitAllowed = this.permissions.can('pim_channels:write');
  protected readonly mediaAllowed = this.permissions.can('media_library:write');
  protected readonly opsAllowed = this.permissions.can('ops_health:read');
  protected readonly customersAllowed = this.permissions.can('b2b_companies:read');
  protected readonly vehiclesAllowed = this.permissions.can('delivery_settings:read');
  protected readonly vehiclesWritable = this.permissions.can('delivery_settings:write');
  protected readonly accessAllowed = this.permissions.can('staff_access:read');
  protected readonly accessWritable = this.permissions.can('staff_access:write');
  protected readonly suggestionsAllowed = this.permissions.can('lfc_suggestions:read');
  protected readonly suggestionsWritable = this.permissions.can('lfc_suggestions:write');

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
    this.declareAll();
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
    runInInjectionContext(this.injector, () => this.declareAll());
    this.bridged.set(true);
    return true;
  }

  /** Déclare les sept trousses ; à appeler dans le contexte d'injection du composant. */
  private declareAll(): void {
    this.tools.set(this.pimAllowed ? declarePimAgentTools(this.reemitAllowed) : []);
    this.mediaTools.set(this.mediaAllowed ? declareMediaAgentTools() : []);
    this.opsTools.set(this.opsAllowed ? declareOpsAgentTools() : []);
    this.customerTools.set(this.customersAllowed ? declareCustomerAgentTools() : []);
    this.vehicleTools.set(
      this.vehiclesAllowed ? declareVehicleAgentTools(this.vehiclesWritable) : [],
    );
    this.accessTools.set(this.accessAllowed ? declareAccessAgentTools(this.accessWritable) : []);
    this.suggestionTools.set(
      this.suggestionsAllowed ? declareSuggestionAgentTools(this.suggestionsWritable) : [],
    );
  }
}
