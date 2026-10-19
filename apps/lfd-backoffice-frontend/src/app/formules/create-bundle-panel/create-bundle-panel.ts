import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  type FoldPanelDefaults,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTextareaComponent,
} from 'fold-ng';
import { httpErrorMessage } from '@lfd/endpoints';

import { BundleCompositionEditor } from '../bundle-composition-editor/bundle-composition-editor';
import { compositionProblem, creationPayload, type GroupDraft, newGroup } from '../bundle-draft';
import { BundlesService } from '../bundles.service';

/**
 * **Créer une formule** — son nom, sa description et ses groupes, envoyés
 * ensemble : le serveur refuse une formule de moins de deux groupes, l'écran
 * le dit avant l'envoi. Ferme sur la clé créée ; renoncer ne rend rien. Un
 * refus du serveur reste dans le panneau, la saisie aussi.
 *
 * Un panneau plutôt qu'une page `/formules/nouvelle` : la clé d'une formule
 * est tirée de son nom, et une formule nommée « Nouvelle » aurait pris
 * l'adresse de la création.
 */
@Component({
  selector: 'app-create-bundle-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BundleCompositionEditor,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './create-bundle-panel.html',
  styleUrl: './create-bundle-panel.scss',
})
export class CreateBundlePanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'lg' };

  private readonly ref = inject<FoldPanelRef<string>>(FoldPanelRef);
  private readonly api = inject(BundlesService);

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly groups = signal<readonly GroupDraft[]>([newGroup(), newGroup()]);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly missing = computed<string | null>(() =>
    this.name().trim() === '' ? 'Donnez un nom à la formule.' : compositionProblem(this.groups()),
  );

  protected async submit(): Promise<void> {
    if (this.missing() !== null) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      const created = await this.api.create(
        creationPayload(this.name(), this.description(), this.groups()),
      );
      this.ref.close(created.key);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "La formule n'a pas pu être créée."));
    } finally {
      this.busy.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
