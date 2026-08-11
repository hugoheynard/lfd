import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { CompanyMemberStatus, CompanyMemberView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../notify.service';

/** Ce que chaque état d'accès dit, en clair — et de quelle couleur. */
const STATUS_LABELS: Readonly<Record<CompanyMemberStatus, string>> = {
  invited: 'Lien envoyé, mot de passe pas encore choisi',
  active: 'Actif',
  disabled: 'Désactivé',
};

/**
 * Section **Accès à l'espace** d'une société (staff).
 *
 * Elle répond à la seule question que le commercial se pose après avoir ouvert
 * un compte : « le client peut-il se connecter ? ». `invited` y est un état
 * **utile** et non un détail technique — c'est la différence entre « il n'a pas
 * encore posé son mot de passe » et « il ne s'est pas connecté depuis
 * longtemps », et donc entre renvoyer un lien et décrocher le téléphone.
 *
 * Inviter et renvoyer sont le **même** appel : l'API est idempotente sur
 * l'adresse. Deux boutons pour un geste, ce serait deux façons de se tromper.
 */
@Component({
  selector: 'app-acces-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldInputComponent,
  ],
  templateUrl: './acces-section.html',
  styleUrl: './acces-section.scss',
})
export class AccesSection {
  private readonly service = inject(AdminCompaniesService);
  private readonly notify = inject(NotifyService);

  readonly companyId = input.required<string>();

  /**
   * Le **détenteur** tel que la fiche le connaît — son adresse est déjà saisie.
   *
   * La redemander au commercial serait absurde : il vient de la taper à
   * l'ouverture du compte, et c'est précisément le cas où l'accès a échoué (pas
   * de canal d'identité) qu'il faut rattraper en un clic.
   */
  readonly holderEmail = input('');
  readonly holderFirstName = input('');
  readonly holderLastName = input('');

  protected readonly members = signal<readonly CompanyMemberView[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);

  /** Formulaire d'invitation — replié tant qu'on ne s'en sert pas. */
  protected readonly inviting = signal(false);
  protected readonly email = signal('');
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');

  /** Personne n'accède encore : c'est le cas qui doit sauter aux yeux. */
  protected readonly empty = computed(() => !this.loading() && this.members().length === 0);

  /** Vrai quand on peut ouvrir l'accès du détenteur sans rien retaper. */
  protected readonly canOpenHolder = computed(
    () => this.empty() && this.holderEmail().trim() !== '',
  );

  protected readonly canInvite = computed(() => this.email().trim() !== '' && !this.busy());

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.members.set(await this.service.listMembers(this.companyId()));
      this.failed.set(false);
    } catch {
      this.members.set([]);
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected statusLabel(member: CompanyMemberView): string {
    return STATUS_LABELS[member.status];
  }

  protected roleLabel(member: CompanyMemberView): string {
    return member.role === 'company_admin' ? "Gestionnaire de l'espace" : 'Membre';
  }

  /** Le nom d'usage, ou l'adresse quand on ne connaît pas encore le nom. */
  protected nameOf(member: CompanyMemberView): string {
    const full = `${member.firstName} ${member.lastName}`.trim();
    return full === '' ? member.email : full;
  }

  /** Ouvre un accès, ou **renvoie** son lien : c'est le même appel. */
  protected async invite(email: string, role: 'company_admin' | 'member'): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const result = await this.service.inviteMember(this.companyId(), {
        email: email.trim(),
        firstName: this.firstName().trim(),
        lastName: this.lastName().trim(),
        phone: '',
        role,
      });
      // Le sort de l'envoi n'est pas arrondi : un « c'est envoyé ! » de
      // politesse ferait attendre un e-mail qui n'arrivera jamais.
      this.notify.success(
        result.mailSent
          ? `Lien envoyé à ${result.member.email}.`
          : `Accès ouvert pour ${result.member.email}, mais l'e-mail n'est pas parti — prévenez le client.`,
      );
      this.reset();
      await this.load();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.busy.set(false);
    }
  }

  /** Invite l'adresse saisie dans le formulaire. */
  protected inviteNew(): void {
    void this.invite(this.email(), 'company_admin');
  }

  /**
   * Ouvre l'accès du détenteur **déjà connu de la fiche** — un clic, aucune
   * saisie. C'est le rattrapage du compte créé pendant que le fournisseur
   * d'identité était injoignable.
   */
  protected openHolderAccess(): void {
    this.firstName.set(this.holderFirstName());
    this.lastName.set(this.holderLastName());
    void this.invite(this.holderEmail(), 'company_admin');
  }

  /** Renvoie le lien à quelqu'un qui n'a pas encore posé son mot de passe. */
  protected resend(member: CompanyMemberView): void {
    void this.invite(member.email, member.role);
  }

  protected reset(): void {
    this.inviting.set(false);
    this.email.set('');
    this.firstName.set('');
    this.lastName.set('');
  }
}
