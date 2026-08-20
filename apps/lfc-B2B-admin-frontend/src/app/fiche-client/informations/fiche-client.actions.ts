import { inject, Injectable, signal } from '@angular/core';
import type {
  CompanyMemberInvitedView,
  DeferredTerm,
  DeliveryAddressView,
  FulfillmentPreferenceView,
} from '@lfd/contracts';
import type { CompanyIdentityDraft } from '@lfd/b2b-ui/company';

import type { AdminCompanyDetail, CompanyOpened } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../notify.service';
import type { HolderChoice } from '../holder-picker/holder-picker';
import { validUntil } from '../../admin/acces-en-attente/pending-access.model';

/**
 * Ce que la fiche **écrit**.
 *
 * Chaque geste suit le même trio : muter, annoncer, laisser l'appelant
 * recharger. Le rechargement n'est pas fait ici — ces actions ne connaissent pas
 * l'état de l'écran ; c'est la façade qui recoud les deux.
 *
 * Aucune ne décide du droit d'agir : le mur est côté serveur (auth staff), et le
 * doubler ici donnerait deux vérités à tenir d'accord.
 */
@Injectable()
export class FicheClientActions {
  private readonly service = inject(AdminCompaniesService);
  private readonly notify = inject(NotifyService);

  /** Une ouverture d'accès est en cours — empêche le double envoi. */
  readonly granting = signal(false);
  /** Une ouverture de compte est en cours. */
  readonly creating = signal(false);

  /**
   * Ouvre le compte. Rend l'identifiant créé, ou `null` si rien n'a été écrit —
   * l'appelant en tire la navigation, cette classe ne navigue pas.
   */
  async openAccount(
    identity: CompanyIdentityDraft,
    holder: HolderChoice | null,
  ): Promise<string | null> {
    this.creating.set(true);
    try {
      const created = await this.service.create({
        identity: trimIdentity(identity),
        // Le détenteur EST le contact principal de la société : celui qu'on
        // rappelle est celui qui commande. Absent, la société s'ouvre sur son
        // seul nom d'usage et il se rattachera depuis la fiche.
        contact:
          holder === null
            ? undefined
            : {
                firstName: holder.firstName,
                lastName: holder.lastName,
                // Vide à l'ouverture : la fonction se saisit depuis la fiche,
                // sur la carte Contacts. Au téléphone on a un nom, rarement un
                // intitulé de poste — l'exiger ici bloquerait pour rien.
                fonction: '',
                email: holder.email,
                phone: holder.phone,
                // Le détenteur ne choisit pas son rôle, il l'EST — le serveur
                // pose `owner` à l'ouverture.
                role: '',
              },
      });
      this.notify.success(openingMessage(created));
      return created.id;
    } catch (error) {
      this.notify.error(error);
      return null;
    } finally {
      this.creating.set(false);
    }
  }

  /** Active le compte — le geste qui clôt le dossier. */
  activate(company: AdminCompanyDetail): Promise<boolean> {
    return this.run(() => this.service.activate(company.id), 'Compte activé.');
  }

  /** Dépose le KBIS. */
  uploadKbis(company: AdminCompanyDetail, file: File): Promise<boolean> {
    return this.run(() => this.service.uploadKbis(company.id, file), 'KBIS déposé.');
  }

  /**
   * **Certifie** le KBIS déposé. Ce n'est pas une case qu'on coche : c'est la
   * garantie que l'identité du compte a été confrontée à un document officiel.
   */
  certifyKbis(company: AdminCompanyDetail): Promise<boolean> {
    return this.run(() => this.service.certifyKbis(company.id), 'KBIS certifié.');
  }

  /** Retire la certification (erreur de manipulation, extrait périmé). */
  revokeKbisCertification(company: AdminCompanyDetail): Promise<boolean> {
    return this.run(
      () => this.service.revokeKbisCertification(company.id),
      'Certification retirée.',
    );
  }

  /** Rend l'accès à un compte suspendu par décision humaine. */
  reactivate(company: AdminCompanyDetail): Promise<boolean> {
    return this.run(() => this.service.reactivate(company.id), 'Compte réactivé.');
  }

  /** Accorde (ou retire) les crédits de règlement — l'ensemble complet part. */
  grantTerms(company: AdminCompanyDetail, terms: readonly DeferredTerm[]): Promise<boolean> {
    return this.run(
      () => this.service.grantTerms(company.id, terms),
      'Moyens de paiement mis à jour.',
    );
  }

  /** Pose (ou retire) la préférence d'acheminement. */
  preferFulfillment(
    company: AdminCompanyDetail,
    preference: FulfillmentPreferenceView,
  ): Promise<boolean> {
    return this.run(
      () => this.service.preferFulfillment(company.id, preference),
      "Préférence d'acheminement enregistrée.",
    );
  }

  /** Désigne l'adresse de livraison par défaut. */
  setDefaultDelivery(company: AdminCompanyDetail, address: DeliveryAddressView): Promise<boolean> {
    return this.run(
      () => this.service.setDefaultDelivery(company.id, address.id),
      'Adresse par défaut mise à jour.',
    );
  }

  /** Archive une adresse de livraison. */
  removeDelivery(company: AdminCompanyDetail, address: DeliveryAddressView): Promise<boolean> {
    return this.run(
      () => this.service.removeDelivery(company.id, address.id),
      'Adresse de livraison retirée.',
    );
  }

  /** Retire un interlocuteur du carnet. */
  removeContact(company: AdminCompanyDetail, contactId: string): Promise<boolean> {
    return this.run(
      () => this.service.removeContact(company.id, contactId),
      'Interlocuteur retiré.',
    );
  }

  /**
   * Ouvre l'accès d'un interlocuteur — ou lui **renvoie** son lien : c'est le
   * même appel, l'API étant idempotente sur l'adresse. Deux boutons pour un
   * geste, ce serait deux façons de se tromper.
   */
  async openAccess(company: AdminCompanyDetail, contactId: string | null): Promise<boolean> {
    const contact = company.contacts.find((row) => row.contactId === contactId);
    if (contact === undefined || this.granting()) {
      return false;
    }
    if (contact.role === null) {
      // Sans rôle, on ne saurait pas quoi lui ouvrir. Le dire vaut mieux que
      // choisir à sa place un rôle qu'on ne saurait plus distinguer d'un vrai.
      this.notify.info("Précisez d'abord son rôle dans la société.");
      return false;
    }
    this.granting.set(true);
    try {
      const result = await this.service.inviteMember(company.id, {
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        role: contact.role,
      });
      // Le sort de l'envoi n'est pas arrondi : un « c'est envoyé ! » de
      // politesse ferait attendre un e-mail qui n'arrivera jamais.
      this.notify.success(accessMessage(result));
      // Canal muet : on ne renvoie pas le commercial sur un autre écran, il a
      // le client au téléphone. Le lien atterrit dans son presse-papier, ici.
      if (!result.mailSent) {
        await this.copyAccessLink(result.member.userId);
      }
      return true;
    } catch (error) {
      this.notify.error(error);
      return false;
    } finally {
      this.granting.set(false);
    }
  }

  /**
   * Rattache le **détenteur** d'un compte ouvert sans lui — l'autre moitié de
   * « on ouvre avec l'enseigne seule ».
   *
   * Le même verrou que l'ouverture d'accès (`granting`) : c'en est une, et un
   * double envoi provisionnerait deux fois la même adresse.
   */
  async attachHolder(company: AdminCompanyDetail, holder: HolderChoice): Promise<boolean> {
    if (this.granting()) {
      return false;
    }
    this.granting.set(true);
    try {
      const result = await this.service.attachHolder(company.id, {
        email: holder.email,
        firstName: holder.firstName,
        lastName: holder.lastName,
        fonction: '',
        phone: holder.phone,
      });
      this.notify.success(
        result.mailSent
          ? `Détenteur rattaché, l'accès est en route vers ${holder.email}.`
          : `Détenteur rattaché, mais l'e-mail n'est pas parti — prévenez le client.`,
      );
      return true;
    } catch (error) {
      this.notify.error(error);
      return false;
    } finally {
      this.granting.set(false);
    }
  }

  /**
   * Fabrique le lien et le met dans le presse-papier — le repli quand l'e-mail
   * n'est pas parti.
   *
   * Un lien **neuf** à chaque fois : il est à usage unique et daté, et celui de
   * l'envoi manqué n'existe plus. L'échec est silencieux ici — le message
   * principal a déjà dit l'essentiel (« l'accès est ouvert »), et empiler deux
   * toasts sur un même geste apprend à les fermer sans les lire.
   */
  private async copyAccessLink(userId: string): Promise<void> {
    try {
      const link = await this.service.issueAccessLink(userId);
      await navigator.clipboard.writeText(link.url);
      this.notify.success(`Lien copié — valable jusqu'au ${validUntil(link.expiresAt)}.`);
    } catch {
      this.notify.success('Lien à remettre depuis « Accès à remettre ».');
    }
  }

  /** Mute, annonce, et dit si ça a tenu — le trio commun à tous les gestes. */
  private async run(mutate: () => Promise<void>, done: string): Promise<boolean> {
    try {
      await mutate();
      this.notify.success(done);
      return true;
    } catch (error) {
      this.notify.error(error);
      return false;
    }
  }
}

/**
 * Ce qu'on annonce au commercial après l'ouverture — il a encore le client au
 * téléphone, et ce qu'il va lui dire dépend entièrement de ce qui suit.
 *
 * Le cas muet (`mailSent` faux) est le plus important à ne pas arrondir : le
 * compte existe, mais **personne n'a rien reçu**. Et « pas de détenteur » n'est
 * pas un incident : annoncer une panne à qui vient de choisir d'attendre l'usera
 * jusqu'à ce qu'il n'écoute plus les vraies.
 */
export function openingMessage(opened: CompanyOpened): string {
  if (opened.holder === 'deferred') {
    return 'Compte ouvert. Rattachez le détenteur dès que vous aurez son adresse.';
  }
  if (opened.holder === 'failed') {
    return "Compte ouvert, mais l'accès du client n'a pas pu être créé — à reprendre depuis sa fiche.";
  }
  return opened.mailSent
    ? "Compte ouvert, l'accès du détenteur est en route."
    : "Compte ouvert, mais l'e-mail n'est pas parti — prévenez le client.";
}

/**
 * Ce qu'on annonce après avoir ouvert un accès.
 *
 * **Une seule phrase**, que la personne ait déjà un compte ou non. Distinguer
 * les deux cas apprendrait au commercial que l'adresse qu'il vient de saisir est
 * déjà connue de la plateforme — donc que cette personne travaille avec un autre
 * de nos clients. Le sort de l'envoi, en revanche, se dit toujours : il parle de
 * NOTRE canal, pas de la personne.
 */
export function accessMessage(result: CompanyMemberInvitedView): string {
  const who = result.member.email;
  return result.mailSent
    ? `C'est envoyé à ${who}.`
    : `Accès ouvert pour ${who}, mais l'e-mail n'est pas parti — prévenez le client.`;
}

/**
 * Rogne l'identité avant l'envoi : un espace de copier-coller ne doit pas
 * devenir une raison sociale qui ne ressort d'aucune recherche.
 */
export function trimIdentity(draft: CompanyIdentityDraft): CompanyIdentityDraft {
  return {
    raisonSociale: draft.raisonSociale.trim(),
    enseigne: draft.enseigne.trim(),
    formeJuridique: draft.formeJuridique.trim(),
    siret: draft.siret.trim(),
    tvaIntracom: draft.tvaIntracom.trim(),
  };
}
