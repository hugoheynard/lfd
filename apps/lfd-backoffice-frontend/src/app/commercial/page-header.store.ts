import {
  DestroyRef,
  Injectable,
  TemplateRef,
  effect,
  inject,
  signal,
  type Signal,
} from '@angular/core';

/**
 * **Ce qu'une vue routée ajoute à l'en-tête de sa coquille** — ses actions, et
 * ses chiffres.
 *
 * ## Le problème qu'il résout
 *
 * L'en-tête du poste commercial appartient à `CommercialPage` : c'est elle qui
 * porte le nom de la vue et sa description, lus dans le catalogue d'espaces.
 * Mais deux choses sont propres à la vue : ses **actions** — « Créer un compte »
 * n'a de sens que sur le parc — et ses **chiffres**, l'état du portefeuille pour
 * l'une, tout autre chose pour la suivante.
 *
 * Or une vue vit dans un `<router-outlet />` : sa projection de contenu ne
 * traverse pas jusqu'à la coquille. La faire remonter par un `@Input` obligerait
 * la coquille à connaître ses vues, ce qui est exactement ce que le catalogue
 * d'espaces a été construit pour éviter.
 *
 * ## Pourquoi un gabarit, et pas des données
 *
 * Une liste de « boutons » décrits en objets marcherait pour deux boutons et
 * casserait au troisième — le jour où l'un porte un compteur, un menu ou un état
 * de chargement. Un `TemplateRef` laisse la vue écrire son morceau d'en-tête
 * dans son propre gabarit, avec ses propres signaux ; la coquille le pose, elle
 * ne le comprend pas.
 *
 * ## Sa portée
 *
 * Même motif exactement que `provideWorkspaceRail` : la vue publie à l'entrée,
 * efface à la sortie, et la dernière montée gagne. Il n'y a jamais deux vues
 * d'un même espace à l'écran.
 */
/** Les deux morceaux d'en-tête qu'une vue peut fournir. Les deux facultatifs. */
export interface PageHeaderSlots {
  /** À droite du titre : files d'attente, action principale. */
  readonly actions?: Signal<TemplateRef<unknown> | null>;
  /** Sous le titre : les chiffres de la vue, dans la bande et non sur le papier. */
  readonly figures?: Signal<TemplateRef<unknown> | null>;
}

@Injectable({ providedIn: 'root' })
export class PageHeaderStore {
  private readonly actionsValue = signal<TemplateRef<unknown> | null>(null);
  private readonly figuresValue = signal<TemplateRef<unknown> | null>(null);

  /** Ce que la vue courante pose à droite du titre, ou `null`. */
  readonly actions: Signal<TemplateRef<unknown> | null> = this.actionsValue.asReadonly();
  /** Ce qu'elle pose sous le titre, ou `null` — la bande n'a alors que son nom. */
  readonly figures: Signal<TemplateRef<unknown> | null> = this.figuresValue.asReadonly();

  set(slots: { actions: TemplateRef<unknown> | null; figures: TemplateRef<unknown> | null }): void {
    this.actionsValue.set(slots.actions);
    this.figuresValue.set(slots.figures);
  }
}

/**
 * Publier ces gabarits dans l'en-tête tant que le composant vit.
 *
 * À appeler depuis un contexte d'injection. Ils suivent leurs signaux — une vue
 * peut n'avoir d'actions que dans certains états — et s'effacent à la
 * destruction : quitter la vue ne laisse pas ses boutons dans l'en-tête de la
 * suivante.
 */
export function providePageHeader(slots: PageHeaderSlots): void {
  const store = inject(PageHeaderStore);
  // Un `effect`, et pas une lecture au constructeur : les gabarits viennent de
  // `viewChild`, qui ne sont pas encore résolus à ce moment-là. L'effet attend
  // qu'ils le soient, exactement comme `provideWorkspaceRail` attend ses droits.
  effect(() =>
    store.set({ actions: slots.actions?.() ?? null, figures: slots.figures?.() ?? null }),
  );
  inject(DestroyRef).onDestroy(() => store.set({ actions: null, figures: null }));
}
