import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { EmailReplyAttachmentView, EmailReplyDetailsView } from '@lfd/contracts';
import { FoldBadgeComponent, FoldFieldComponent, FoldFieldListComponent } from 'fold-ng';

const KILO = 1024;

/** Une taille lisible : octets, Ko ou Mo, à la française. */
function readableSize(bytes: number): string {
  if (bytes < KILO) return `${bytes} o`;
  const format = (value: number): string =>
    value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  if (bytes < KILO * KILO) return `${format(bytes / KILO)} Ko`;
  return `${format(bytes / (KILO * KILO))} Mo`;
}

/**
 * **Les détails d'une réponse d'un client à un e-mail** (plan
 * `documentation/demandes-client/plan-reponses-par-e-mail.md`, R3) : l'objet,
 * les pièces jointes, le verdict d'expéditeur et la commande présumée. Le
 * texte, lui, est rendu par l'enveloppe (`customer-request-card`).
 *
 * 🔴 Rien de ce que l'expéditeur a écrit n'est rendu autrement que par
 * interpolation : aucun `innerHTML`, aucun lien tiré du message. Les pièces
 * jointes sont LISTÉES — nom, type, taille — et jamais ouvrables : le serveur
 * ne les range pas.
 */
@Component({
  selector: 'app-email-reply-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldFieldComponent, FoldFieldListComponent, RouterLink],
  templateUrl: './email-reply-details.html',
  styleUrl: './email-reply-details.scss',
})
export class EmailReplyDetails {
  /** Reçu de la carte comme tout composant de détails ; inutile ici. */
  readonly requestId = input.required<string>();
  readonly details = input.required<EmailReplyDetailsView>();

  protected readonly attachments = computed(() =>
    this.details().attachments.map((a: EmailReplyAttachmentView) => ({
      ...a,
      size: readableSize(a.sizeBytes),
    })),
  );
}
