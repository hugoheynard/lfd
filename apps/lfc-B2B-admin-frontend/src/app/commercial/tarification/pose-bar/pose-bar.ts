import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

import type { AdminCompany } from '../../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { nativeValue } from '../../../shared/native-input';

/** Chez qui, et sur quelle fenêtre. */
export interface PoseRequest {
  readonly companyId: string;
  readonly validFrom: string;
  readonly validTo: string | null;
}

/**
 * **Poser une grille chez un client, en ligne.**
 *
 * Une barre dans l'en-tête et non un panneau : un tiroir aurait masqué la grille
 * au moment précis où l'on choisit chez qui la poser — alors que le seul contrôle
 * utile est de la relire. Ce qu'on pose est ce qu'on a sous les yeux.
 *
 * Elle ne pose rien elle-même : elle **demande**. La page tient l'identifiant du
 * gabarit et l'appel, parce que c'est elle qui sait s'il est enregistré.
 */
@Component({
  selector: 'app-pose-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './pose-bar.html',
  styleUrl: './pose-bar.scss',
})
export class PoseBar {
  /** Vrai pendant l'appel : la page le sait, la barre l'affiche. */
  readonly busy = input(false);
  readonly posed = output<PoseRequest>();

  private readonly companiesService = inject(AdminCompaniesService);

  protected readonly nativeValue = nativeValue;

  protected readonly companies = signal<readonly AdminCompany[]>([]);
  protected readonly companyId = signal('');
  protected readonly validFrom = signal(new Date().toISOString().slice(0, 10));
  protected readonly validTo = signal('');

  protected readonly canPose = computed(
    () => this.companyId() !== '' && this.validFrom() !== '' && !this.busy(),
  );

  constructor() {
    void this.load();
  }

  /**
   * La liste se charge à la construction de la barre, donc **avec** la grille.
   * Attendre un clic aurait fait patienter au moment de poser, sur une page déjà
   * chargée — le pire endroit pour une attente.
   */
  private async load(): Promise<void> {
    const companies = await this.companiesService.list();
    this.companies.set(companies);
    this.companyId.set(companies[0]?.id ?? '');
  }

  protected pose(): void {
    if (!this.canPose()) {
      return;
    }
    this.posed.emit({
      companyId: this.companyId(),
      validFrom: new Date(`${this.validFrom()}T00:00:00.000Z`).toISOString(),
      validTo:
        this.validTo() === '' ? null : new Date(`${this.validTo()}T00:00:00.000Z`).toISOString(),
    });
  }
}
