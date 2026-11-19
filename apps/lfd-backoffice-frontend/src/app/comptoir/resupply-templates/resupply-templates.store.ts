import { inject, Injectable, signal } from '@angular/core';
import type {
  ResupplyTemplateContentPayload,
  ResupplyTemplateView,
  SavedResupplyTemplateResponse,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import { GestureIntents, sentOnce } from '../../shared/gesture-intents';
import { ResupplyTemplatesService } from './resupply-templates.service';

/**
 * **La bibliothèque d'UN point**, tenue en signaux pour l'écran des modèles.
 *
 * Fourni par la page qui l'affiche : la bibliothèque meurt avec elle. Elle part
 * vide et se remplit ; seul l'échec de lecture change le sens de la page
 * (`loadError`). Chaque écriture relit derrière elle, et son refus est relancé
 * à l'écran qui l'a demandée.
 *
 * La création porte la clé d'un {@link GestureIntents} par point : un double
 * clic ou un réessai après une coupure renvoie la même clé, et le serveur rend
 * le modèle déjà écrit au lieu d'en créer un second.
 */
@Injectable()
export class ResupplyTemplatesStore {
  private readonly service = inject(ResupplyTemplatesService);
  private readonly intents = new GestureIntents();

  private readonly siteState = signal<string | null>(null);
  private readonly templatesState = signal<readonly ResupplyTemplateView[]>([]);
  private readonly loadErrorState = signal<string | null>(null);

  readonly siteId = this.siteState.asReadonly();
  readonly templates = this.templatesState.asReadonly();
  /** Le refus de la dernière lecture ; `null` : la liste dit vrai. */
  readonly loadError = this.loadErrorState.asReadonly();

  /** Ouvre la bibliothèque d'un point ; un échec de lecture est retenu, pas relancé. */
  async open(siteId: string): Promise<void> {
    if (this.siteState() !== siteId) {
      this.siteState.set(siteId);
      this.templatesState.set([]);
    }
    try {
      await this.reload();
    } catch {
      // Retenu dans `loadError`, que la page lit.
    }
  }

  /** Relit la bibliothèque du point ouvert ; en cas d'échec, la liste garde ce qu'elle avait. */
  async reload(): Promise<void> {
    const siteId = this.siteState();
    if (siteId === null) {
      return;
    }
    try {
      const templates = await this.service.list(siteId);
      if (this.siteState() === siteId) {
        this.templatesState.set(templates);
        this.loadErrorState.set(null);
      }
    } catch (error) {
      if (this.siteState() === siteId) {
        this.loadErrorState.set(httpErrorMessage(error, 'La bibliothèque du point est illisible.'));
      }
      throw error;
    }
  }

  /** Le modèle de la bibliothèque lue, ou `undefined` s'il n'y est pas (ou plus). */
  find(templateId: string): ResupplyTemplateView | undefined {
    return this.templatesState().find((template) => template.id === templateId);
  }

  async create(content: ResupplyTemplateContentPayload): Promise<SavedResupplyTemplateResponse> {
    const siteId = this.requireSite();
    const saved = await sentOnce(this.intents, `create:${siteId}`, (key) =>
      this.service.create(siteId, { ...content, key }),
    );
    await this.reload();
    return saved;
  }

  async adjust(
    templateId: string,
    content: ResupplyTemplateContentPayload,
    version: number,
  ): Promise<SavedResupplyTemplateResponse> {
    const saved = await this.service.adjust(templateId, { ...content, version });
    await this.reload();
    return saved;
  }

  async archive(templateId: string): Promise<void> {
    await this.service.archive(templateId);
    await this.reload();
  }

  private requireSite(): string {
    const siteId = this.siteState();
    if (siteId === null) {
      throw new Error('Aucun point ouvert : la bibliothèque ne sait pas où écrire.');
    }
    return siteId;
  }
}
