import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  LEGAL_ENTITY_LOGO_ACCEPTED_TYPES,
  LEGAL_ENTITY_LOGO_MAX_BYTES,
  MANDATE_PAYMENT_TYPE_LABELS,
  mandatePaymentTypeSchema,
  SEPA_SCHEME_LABELS,
  sepaSchemeSchema,
  type LegalEntityView,
  type MandatePaymentType,
  type SepaScheme,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
  type FoldSelectOption,
} from 'fold-ng';

import { LegalEntitiesService } from '../../../legal-entities.service';
import {
  MandateSchemeDialog,
  type MandateSchemeDialogData,
} from '../mandate-scheme-dialog/mandate-scheme-dialog';

/**
 * **Ce qui façonne les mandats d'une entité** : leur schéma (CORE ou
 * interentreprises), son logo, la description du contrat (zone 20) et le type
 * de paiement (zone 12).
 *
 * ## Le schéma ne s'enregistre pas avec le reste
 *
 * Il décide si le débiteur peut se faire rembourser et s'il doit passer par sa
 * banque : le choisir ouvre un dialogue qui nomme ces conséquences et chiffre
 * les brouillons rendus caducs, puis l'écrit par sa propre route. Le mettre
 * sous le bouton « Enregistrer » des deux autres réglages ferait basculer le
 * prélèvement d'un client au passage d'une correction de description.
 *
 * ## Les trois vont ensemble, et ce n'est pas un fourre-tout
 *
 * Chacun se voit sur le même papier, et nulle part ailleurs. Un logo n'est ni
 * une mention légale ni une coordonnée bancaire : il n'a de sens que parce qu'un
 * mandat porte une cellule d'en-tête. Les séparer ferait trois cartes qui
 * répondent toutes à « à quoi ressemblera le mandat que je fais signer ».
 *
 * ## 🔴 L'import du logo n'existait NULLE PART
 *
 * Le backend sert `POST/GET/DELETE :id/logo` depuis le 2026-09-10, et aucun
 * écran ne les appelait — seul le semis de développement attachait un logo
 * (constaté le 2026-09-12). Sur une base réelle, tous les mandats sortaient donc
 * avec leur cellule vide, sans que rien ne le signale : un mandat sans logo
 * reste valide, et c'est exactement ce qui rendait l'absence indolore.
 *
 * ## Ce qui n'est PAS gelé après le premier mandat
 *
 * Contrairement au titulaire du compte créancier, ces trois-là se corrigent
 * toujours. Le nom gelé est celui que le débiteur a lu et signé ; en changer
 * dirait qu'il a autorisé quelqu'un d'autre. Une description indicative, un logo
 * ou un régime de paiement n'engagent rien de tel, et chaque mandat déjà signé
 * garde les siens, imprimés sur son papier.
 */
@Component({
  selector: 'app-mandate-settings-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldButtonComponent,
  ],
  templateUrl: './mandate-settings-card.html',
  styleUrl: './mandate-settings-card.scss',
})
export class MandateSettingsCard {
  private readonly api = inject(LegalEntitiesService);
  private readonly panels = inject(FoldPanelHostService);

  readonly entity = input.required<LegalEntityView>();
  readonly busy = input(false);

  /** Ce que le geste a fait, pour que la page relise et annonce. */
  readonly saved = output<{ readonly action: () => Promise<unknown>; readonly said: string }>();

  protected readonly accepted = LEGAL_ENTITY_LOGO_ACCEPTED_TYPES.join(',');
  protected readonly maxBytes = LEGAL_ENTITY_LOGO_MAX_BYTES;

  protected readonly descriptionDraft = signal('');
  protected readonly paymentTypeDraft = signal<MandatePaymentType>('recurrent');
  /**
   * Ce que montre la liste. Distinct de `entity().mandateScheme` pour pouvoir
   * REVENIR au schéma en vigueur quand la confirmation est annulée : sans ce
   * signal, la liste garderait le choix abandonné sous les yeux.
   */
  protected readonly schemeDraft = signal<SepaScheme>('B2B');
  protected readonly logoPreview = signal<string | null>(null);

  /** Les deux régimes de la zone 12 — la norme n'en connaît pas d'autre. */
  protected readonly paymentTypes: FoldSelectOption<MandatePaymentType>[] =
    mandatePaymentTypeSchema.options.map((value) => ({
      value,
      label: MANDATE_PAYMENT_TYPE_LABELS[value],
    }));

  /** Les deux schémas que la norme connaît. */
  protected readonly schemes: FoldSelectOption<SepaScheme>[] = sepaSchemeSchema.options.map(
    (value) => ({ value, label: SEPA_SCHEME_LABELS[value] }),
  );

  constructor() {
    effect(() => {
      const current = this.entity();
      this.schemeDraft.set(current.mandateScheme);
      this.descriptionDraft.set(current.mandateContractDescription);
      this.paymentTypeDraft.set(current.mandatePaymentType);
      void this.loadLogo(current);
    });
  }

  /**
   * `fold-listbox` rend `null` quand rien n'est choisi. Ici il y a toujours un
   * régime — la zone 12 du mandat est binaire et se coche d'avance — donc un
   * `null` ne peut venir que d'un effacement de l'écran, et on garde le
   * précédent plutôt que d'imprimer un mandat sans case cochée.
   */
  protected onPaymentType(value: MandatePaymentType | null): void {
    if (value !== null) {
      this.paymentTypeDraft.set(value);
    }
  }

  /**
   * Un autre schéma choisi : rien ne s'écrit avant la confirmation. Un `null`
   * (effacement) ou le schéma en vigueur ramènent la liste à ce qui est vrai.
   */
  protected onScheme(value: SepaScheme | null): void {
    const current = this.entity().mandateScheme;
    if (value === null || value === current) {
      this.schemeDraft.set(current);
      return;
    }
    this.schemeDraft.set(value);
    void this.confirmScheme(current, value);
  }

  private async confirmScheme(from: SepaScheme, to: SepaScheme): Promise<void> {
    const id = this.entity().id;
    const ref = this.panels.open<MandateSchemeDialogData, boolean>(MandateSchemeDialog, {
      data: { entityId: id, from, to },
    });
    const confirmed = await ref.closed;
    // Revenu à ce qui est en vigueur dans les deux cas : confirmé, c'est la
    // relecture de la page qui posera le nouveau schéma — et un refus du
    // serveur ne laissera pas la liste affirmer un schéma qui n'a pas été écrit.
    this.schemeDraft.set(this.entity().mandateScheme);
    if (confirmed !== true) {
      return;
    }
    this.saved.emit({
      action: () => this.api.setMandateScheme(id, { scheme: to }),
      said: `Schéma des mandats enregistré : ${SEPA_SCHEME_LABELS[to]}.`,
    });
  }

  protected saveDefaults(): void {
    const id = this.entity().id;
    this.saved.emit({
      action: () =>
        this.api.setMandateDefaults(id, {
          contractDescription: this.descriptionDraft().trim(),
          paymentType: this.paymentTypeDraft(),
        }),
      said: 'Réglages de mandat enregistrés.',
    });
  }

  protected uploadLogo(event: Event): void {
    const picker = event.target as HTMLInputElement;
    const file = picker.files?.[0];
    if (file === undefined) {
      return;
    }
    // Vidé TOUT DE SUITE : sans ça, rechoisir le même fichier après un refus
    // n'émet aucun `change`, et l'écran paraît ne rien faire.
    picker.value = '';
    const id = this.entity().id;
    this.saved.emit({
      action: () => this.api.setLogo(id, file),
      said: 'Logo attaché — les mandats de cette entité le porteront.',
    });
  }

  protected removeLogo(): void {
    const id = this.entity().id;
    this.saved.emit({
      action: () => this.api.removeLogo(id),
      said: 'Logo retiré. Les mandats restent valides, leur cellule sera vide.',
    });
  }

  /**
   * Charge la vignette.
   *
   * ⚠️ En **blob**, pas par un `<img src="/admin/…">` : un lien direct part sans
   * le jeton staff — l'intercepteur ne voit que les requêtes `HttpClient` — et
   * le navigateur afficherait une image cassée, qu'on lirait comme un logo
   * absent.
   */
  private async loadLogo(entity: LegalEntityView): Promise<void> {
    this.revoke();
    if (!entity.hasLogo) {
      return;
    }
    try {
      this.logoPreview.set(URL.createObjectURL(await this.api.logo(entity.id)));
    } catch {
      // Muet : la vignette est décorative, et `hasLogo` a déjà dit la vérité.
      this.logoPreview.set(null);
    }
  }

  private revoke(): void {
    const current = this.logoPreview();
    if (current !== null) {
      URL.revokeObjectURL(current);
      this.logoPreview.set(null);
    }
  }
}
