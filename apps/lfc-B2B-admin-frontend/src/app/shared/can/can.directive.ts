import {
  Directive,
  effect,
  inject,
  input,
  TemplateRef,
  ViewContainerRef,
  type OnDestroy,
} from '@angular/core';
import type { StaffPermission } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';

/**
 * Ne rend son contenu que si la personne connectée a cette permission.
 *
 * ```html
 * <button *appCan="'b2b_companies:write'" foldButton>Activer</button>
 * ```
 *
 * Une affordance qu'on ne peut pas exercer **disparaît** au lieu d'être grisée :
 * un bouton grisé pose une question à laquelle l'écran ne sait pas répondre
 * (« pourquoi ? à qui demander ? »).
 *
 * Elle cache, elle ne protège pas — le refus qui compte est celui du backend.
 */
@Directive({ selector: '[appCan]' })
export class CanDirective implements OnDestroy {
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private readonly permissions = inject(PermissionsStore);

  readonly appCan = input.required<StaffPermission>();

  private rendered = false;

  constructor() {
    // Les permissions arrivent après le premier rendu (une requête HTTP les
    // porte) : sans réaction au signal, l'affordance resterait cachée à jamais.
    effect(() => {
      const allowed = this.permissions.can(this.appCan());
      if (allowed === this.rendered) {
        return;
      }
      this.rendered = allowed;
      if (allowed) {
        this.container.createEmbeddedView(this.template);
      } else {
        this.container.clear();
      }
    });
    void this.permissions.ensureLoaded();
  }

  ngOnDestroy(): void {
    this.container.clear();
  }
}
