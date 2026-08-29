import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';
import {
  CompanyIdentityCard,
  formatSiret,
  type CompanyBadgeTone,
  type CompanyIdentityView,
} from '@lfd/b2b-ui/company';

import {
  companyRoleLabel,
  companyStatusLabel,
  type Company,
  type CompanyStatus,
} from '../../../account/account.model';
import { canManageCompany } from '../../../account/account.model';
import { AccountService } from '../../../account/account.service';
import { EntrepriseIdentitePanel } from '../entreprise-identite-panel/entreprise-identite-panel';

/** Ton du badge de statut, par statut de société. */
const STATUS_TONE: Readonly<Record<CompanyStatus, CompanyBadgeTone>> = {
  active: 'success',
  pending: 'warning',
  suspended: 'alert',
  // Une société clôturée : le statut existait côté API, la carte l'ignorait.
  terminated: 'neutral',
};

/** Zone de dépôt KBIS vide, formulée pour le **client** (« votre compte »). */
const KBIS_EMPTY_HINT =
  "L'activation de votre compte passe par la réception de votre extrait KBIS (format PDF).";

/**
 * Section **Identité légale** d'une entreprise côté **client** — _container_ de
 * la carte présentationnelle `@lfd/b2b-ui/company`. Il mappe le modèle `Company`
 * vers le view-model neutre, calcule les capacités (gestionnaire =
 * `admin`) et câble les intentions de la carte (édition, KBIS) vers
 * `AccountService` et le panneau d'édition. Toute la présentation vit dans la
 * lib ; ici, uniquement la donnée, l'auth et les mutations.
 */
@Component({
  selector: 'app-entreprise-identite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CompanyIdentityCard],
  templateUrl: './entreprise-identite.html',
})
export class EntrepriseIdentite {
  private readonly account = inject(AccountService);
  private readonly panelHost = inject(FoldPanelHostService);

  readonly company = input.required<Company>();

  /** Texte de la zone de dépôt KBIS vide, exposé au template. */
  protected readonly kbisEmptyHint = KBIS_EMPTY_HINT;

  /** Modèle `Company` projeté vers le view-model neutre de la carte. */
  protected readonly identity = computed<CompanyIdentityView>(() => {
    const c = this.company();
    return {
      raisonSociale: c.raisonSociale,
      enseigne: c.enseigne,
      formeJuridique: c.formeJuridique,
      siret: formatSiret(c.siret),
      vatNumber: c.vatNumber,
      vatMissing: c.vatNumberRequired && c.vatNumber.trim() === '',
      // Côté client, l'identité légale est exigée à la création : rien ne peut
      // manquer ici. Le rappel existe pour les dossiers ouverts par un
      // commercial, sans les papiers.
      missingLegal: [],
      statusLabel: companyStatusLabel(c.status),
      statusTone: STATUS_TONE[c.status],
      roleLabel: companyRoleLabel(c.role),
      kbis: c.kbis,
    };
  });

  /** Seul le gestionnaire édite l'identité souple et gère le KBIS. */
  protected readonly canManage = computed(() => canManageCompany(this.company().role));

  /** Vrai le temps du dépôt (le service passe en `loading`). */
  protected readonly busy = computed(() => this.account.status() === 'loading');
  /** Erreur d'une action KBIS (dépôt / téléchargement). */
  protected readonly error = signal<string | null>(null);

  /** Édite l'identité souple (enseigne + n° de TVA) via un panneau. */
  protected modifier(): void {
    const company = this.company();
    this.panelHost.open(EntrepriseIdentitePanel, {
      data: {
        companyId: company.id,
        enseigne: company.enseigne,
        vatNumber: company.vatNumber,
      },
      side: 'right',
    });
  }

  /** Téléverse le fichier KBIS choisi dans la carte. */
  protected onKbisSelected(file: File): void {
    this.error.set(null);
    this.account.uploadKbis(this.company().id, file);
  }

  /** Ouvre le KBIS dans un nouvel onglet (le navigateur affiche le PDF). */
  protected view(): void {
    this.withBlob((url) => window.open(url, '_blank', 'noopener'));
  }

  /** Télécharge le KBIS sous son nom. */
  protected download(): void {
    const fileName = this.company().kbis?.fileName ?? 'kbis.pdf';
    this.withBlob((url) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
    });
  }

  /**
   * Récupère le blob authentifié puis en fait quelque chose (voir / télécharger).
   * L'`objectURL` est révoqué après un délai — assez pour que l'onglet/navigateur
   * l'ait chargé, sans fuiter la référence.
   */
  private withBlob(use: (objectUrl: string) => void): void {
    this.error.set(null);
    this.account.fetchKbis(this.company().id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        use(url);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => this.error.set('Impossible de récupérer le KBIS. Réessayez.'),
    });
  }
}
