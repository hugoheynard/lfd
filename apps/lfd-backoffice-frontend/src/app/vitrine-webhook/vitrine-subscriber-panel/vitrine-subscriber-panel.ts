import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { vitrineContents, type VitrineContent, type VitrineCredentialsView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

import { VitrineCredentials } from '../vitrine-credentials/vitrine-credentials';
import { VitrineIdentityFields } from '../vitrine-identity-fields/vitrine-identity-fields';
import { VitrineWebhookService } from '../vitrine-webhook.service';
import {
  blankToNull,
  VITRINE_CONTENT_HINTS,
  VITRINE_CONTENT_LABELS,
  vitrineIdentityIssue,
} from '../vitrine-webhook-format';

/** Une forme d'adresse, dite avant l'envoi ; le serveur reste juge. */
const HTTPS_SHAPE = /^https:\/\/[^\s?#@]+$/;

/**
 * **Déclarer un abonné** — le nom de l'agence, sa description et son contact
 * facultatifs, son adresse et ce qu'elle reçoit. Sur un succès, le panneau ne se ferme pas : il montre le secret et la
 * clé, une seule fois, et se ferme quand on dit les avoir notés.
 */
@Component({
  selector: 'app-vitrine-subscriber-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    VitrineCredentials,
    VitrineIdentityFields,
  ],
  templateUrl: './vitrine-subscriber-panel.html',
  styleUrl: './vitrine-subscriber-panel.scss',
})
export class VitrineSubscriberPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  private readonly api = inject(VitrineWebhookService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly contentChoices = vitrineContents;
  protected readonly labels = VITRINE_CONTENT_LABELS;
  protected readonly hints = VITRINE_CONTENT_HINTS;
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly contactEmail = signal('');
  protected readonly endpointUrl = signal('');
  protected readonly contents = signal<ReadonlySet<VitrineContent>>(new Set(vitrineContents));
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly created = signal<VitrineCredentialsView | null>(null);

  /** Ce qui empêche l'envoi, en clair — ou `''`. */
  protected readonly issue = computed(() => {
    const identity = vitrineIdentityIssue({
      name: this.name(),
      description: this.description(),
      contactEmail: this.contactEmail(),
    });
    if (identity !== '') return identity;
    const url = this.endpointUrl().trim();
    // Vide : un abonné en lecture seule, qui lit le flux et ne reçoit rien.
    if (url !== '' && !HTTPS_SHAPE.test(url)) {
      return 'L’adresse commence par https:// et ne porte ni « ? », ni « # », ni identifiant.';
    }
    return '';
  });

  protected readonly pristine = computed(() => this.name() === '' && this.endpointUrl() === '');

  protected toggle(content: VitrineContent, checked: boolean): void {
    const next = new Set(this.contents());
    if (checked) next.add(content);
    else next.delete(content);
    this.contents.set(next);
  }

  protected async submit(): Promise<void> {
    if (this.issue() !== '' || this.saving()) return;
    this.saving.set(true);
    this.refusal.set(null);
    try {
      this.created.set(
        await this.api.create({
          name: this.name().trim(),
          ...this.optionalEndpoint(),
          contents: vitrineContents.filter((content) => this.contents().has(content)),
          ...this.optionalIdentity(),
        }),
      );
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'L’abonné n’a pas pu être créé.'));
    } finally {
      this.saving.set(false);
    }
  }

  /** Sans adresse, l'abonné est en lecture seule : le champ ne part pas. */
  private optionalEndpoint(): { endpointUrl?: string } {
    const endpointUrl = blankToNull(this.endpointUrl());
    return endpointUrl === null ? {} : { endpointUrl };
  }

  /** La description et le contact ne partent que s'ils sont dits. */
  private optionalIdentity(): { description?: string; contactEmail?: string } {
    const description = blankToNull(this.description());
    const contactEmail = blankToNull(this.contactEmail());
    return {
      ...(description === null ? {} : { description }),
      ...(contactEmail === null ? {} : { contactEmail }),
    };
  }

  protected close(): void {
    this.panel.close(this.created() === null ? undefined : 'created');
  }
}
