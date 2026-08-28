import {
  Directive,
  effect,
  inject,
  Injectable,
  signal,
  TemplateRef,
  type ViewContainerRef,
} from '@angular/core';

/**
 * Le passe-plat du bandeau : l'écran écrit son balisage, le shell le place.
 *
 * Le bandeau est la moitié haute de la descente, et la descente est du chrome —
 * elle touche la barre sans couture et se termine exactement sur le fond de la
 * sous-barre. Elle vit donc DANS le shell, au-dessus du `router-outlet`. Son
 * contenu, lui, appartient à l'écran, qui est en dessous. Il faut bien que
 * quelque chose traverse.
 *
 * Ce quelque chose est un `ViewContainerRef` et pas un signal de `TemplateRef`
 * rendu par un `@if`. La différence n'est pas cosmétique : le gabarit se
 * déclare pendant la CONSTRUCTION de l'écran, c'est-à-dire au milieu du cycle
 * de détection qui vient de créer le shell. Un `@if` qui basculerait là se
 * ferait reprocher un état changé après vérification, et le rendu serveur —
 * qui n'a pas de second tour — écrirait un bandeau vide. Une insertion de vue
 * est impérative : elle a lieu, tout de suite, où qu'on en soit du cycle.
 */
@Injectable({ providedIn: 'root' })
export class ClientBanner {
  /** Là où le shell accepte de recevoir un bandeau. `null` tant qu'il n'existe pas. */
  readonly slot = signal<ViewContainerRef | null>(null);
}

/**
 * `<ng-template clientBanner>` — ce que l'écran veut voir dans la descente.
 *
 * Une directive plutôt qu'un appel de service : l'inscription et la
 * désinscription tiennent au même endroit, et un écran ne peut pas oublier la
 * seconde. Un bandeau qui survivrait à son écran resterait accroché sous la
 * barre de l'écran suivant.
 */
@Directive({ selector: '[clientBanner]' })
export class ClientBannerOutlet {
  private readonly template = inject(TemplateRef);

  constructor() {
    const banner = inject(ClientBanner);
    effect((onCleanup) => {
      const slot = banner.slot();
      if (slot === null) {
        return;
      }
      const view = slot.createEmbeddedView(this.template);
      onCleanup(() => view.destroy());
    });
  }
}
