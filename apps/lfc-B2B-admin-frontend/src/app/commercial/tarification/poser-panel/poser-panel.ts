import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { companyDisplayName } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSelectComponent,
} from 'fold-ng';

import type { AdminCompany } from '../../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { nativeValue } from '../../../shared/native-input';
import { NotifyService } from '../../../notify.service';
import { PriceTemplatesService } from '../templates.service';

/** Charge d'ouverture : le gabarit qu'on pose, et son nom pour le dire. */
export interface PoserPanelData {
  readonly templateId: string;
  readonly label: string;
}

/** Aujourd'hui, au format d'un `<input type="date">`. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * **Poser un gabarit chez un client.**
 *
 * Trois champs, et l'absence du quatrième est la décision : **le contenu ne se
 * re-choisit pas ici**. C'est le gabarit qui le porte. Laisser amender au moment
 * de poser aurait fait deux sources pour un même prix, et « qu'est-ce qu'on lui
 * a mis, au juste ? » n'aurait plus de réponse unique. Pour un client
 * particulier, on compose un gabarit particulier.
 *
 * Le panneau rend le **nombre de règles posées** : une grille de trente lignes à
 * deux paliers en pose soixante, et « appliqué » sans chiffre laisserait croire
 * qu'une ligne vaut une règle.
 */
@Component({
  selector: 'app-poser-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, FoldSelectComponent],
  templateUrl: './poser-panel.html',
  styleUrl: './poser-panel.scss',
})
export class PoserPanel {
  private readonly ref = inject(FoldPanelRef<number>);
  private readonly templates = inject(PriceTemplatesService);
  private readonly companiesService = inject(AdminCompaniesService);
  private readonly notify = inject(NotifyService);

  readonly data = input<PoserPanelData | undefined>(undefined);

  protected readonly nativeValue = nativeValue;
  protected readonly name = companyDisplayName;

  protected readonly companies = signal<readonly AdminCompany[]>([]);
  protected readonly companyId = signal('');
  protected readonly validFrom = signal(today());
  protected readonly validTo = signal('');
  protected readonly saving = signal(false);

  protected readonly canPose = computed(
    () => this.companyId() !== '' && this.validFrom() !== '' && !this.saving(),
  );

  constructor() {
    void this.loadCompanies();
  }

  private async loadCompanies(): Promise<void> {
    try {
      const companies = await this.companiesService.list();
      this.companies.set(companies);
      this.companyId.set(companies[0]?.id ?? '');
    } catch (error) {
      this.notify.error(error, "La liste des clients n'a pas pu être chargée.");
    }
  }

  /**
   * Poser.
   *
   * Un **recouvrement arrête l'application** : si le client a déjà une
   * mercuriale sur un de ces articles à ce seuil pour cette période, le serveur
   * refuse. C'est voulu — écraser en silence une décision déjà prise serait pire
   * qu'un refus, et le commercial doit voir ce qu'il allait remplacer.
   */
  protected async pose(): Promise<void> {
    const data = this.data();
    if (data === undefined || !this.canPose()) {
      return;
    }
    this.saving.set(true);
    try {
      const { posedRules } = await this.templates.apply(data.templateId, {
        companyId: this.companyId(),
        validFrom: new Date(`${this.validFrom()}T00:00:00.000Z`).toISOString(),
        validTo:
          this.validTo() === '' ? null : new Date(`${this.validTo()}T00:00:00.000Z`).toISOString(),
      });
      this.ref.close(posedRules);
    } catch (error) {
      this.notify.error(error, "Le gabarit n'a pas pu être posé.");
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
