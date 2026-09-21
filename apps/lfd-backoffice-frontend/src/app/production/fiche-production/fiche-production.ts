import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { QrCode } from '@lfd/b2b-ui/order';
import { ORDER_ORIGIN_LABELS, type AtelierSheet } from '@lfd/contracts';

/**
 * Une **fiche de fonction** : une commande, sur une feuille A4.
 *
 * Composant à part et non un bloc du gabarit de page : la même feuille servira
 * au tirage à la clôture et, le jour où on l'ajoutera, à l'impression
 * automatique à l'arrivée d'une commande. Deux gabarits divergeraient, et c'est
 * celui qu'on regarde le moins qui aurait tort.
 *
 * **Rendu pur.** Tout ce qui se décide — l'enseigne contre la raison sociale,
 * la chaîne du contact de livraison, l'adresse du point de retrait — est résolu
 * au serveur dans `AtelierSheet`. Ce composant met en forme, il ne choisit
 * rien : une règle métier écrite ici ne serait ni testée avec le reste, ni
 * réutilisée par l'impression automatique.
 *
 * Ce qu'elle porte : qui, où, quoi. **Aucun montant** — et depuis le
 * 2026-09-07 ce n'est plus une consigne mais une forme : `AtelierSheet` n'a pas
 * de propriété monétaire, donc ce gabarit ne peut pas en imprimer une.
 *
 * C'est le **bon de commande** d'audience `atelier`, et non un second document.
 * Il y avait deux types pour ce papier : l'un savait à qui la commande
 * appartient, l'autre quand le tirage avait été arrêté. La fiche du fournil
 * n'avait donc pas d'heure de génération, alors que deux tirages peuvent
 * circuler après un avenant.
 */
@Component({
  selector: 'app-fiche-production',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QrCode],
  templateUrl: './fiche-production.html',
  styleUrl: './fiche-production.scss',
})
export class FicheProduction {
  readonly sheet = input.required<AtelierSheet>();
  /** Le rang dans la pile — « 3 » de « fiche 3/14 ». */
  readonly rank = input.required<number>();
  /** La taille de la pile. Sans elle, un rang seul ne prouve rien. */
  readonly total = input.required<number>();
  /** Le jour de service, déjà mis en forme par la page. */
  readonly dayLabel = input.required<string>();

  /** « RETRAIT » ou « LIVRAISON » — le premier mot que cherche celui qui prépare. */
  protected readonly methodLabel = computed(() =>
    this.sheet().fulfillment.method === 'pickup' ? 'Retrait' : 'Livraison',
  );

  /**
   * L'adresse d'acheminement, en lignes prêtes à poser. Le point de retrait ou
   * l'adresse servie selon le mode — et la fiche n'a plus à choisir : la feuille
   * ne porte qu'UNE adresse, celle qui correspond au mode. Choisir était encore
   * une décision d'écran sur une question déjà tranchée au serveur.
   */
  protected readonly addressLines = computed<readonly string[]>(() => {
    const address = this.sheet().fulfillment.address;
    if (address === null) {
      return [];
    }
    return [address.ligne1, address.ligne2, `${address.codePostal} ${address.ville}`.trim()].filter(
      (line) => line !== '',
    );
  });

  /**
   * L'heure convenue, mise en forme. `null` quand rien n'a été arrêté — la
   * fiche l'écrit alors en toutes lettres plutôt que de laisser un blanc.
   *
   * Une borne basse absente se lit « avant X » : le client a dit jusqu'à quand,
   * pas à partir de quand, et rendre `00:00 – X` inventerait une heure.
   */
  protected readonly windowLabel = computed<string | null>(() => {
    const window = this.sheet().fulfillment.window;
    if (window === null) {
      return null;
    }
    return window.start === null ? `Avant ${window.end}` : `${window.start} – ${window.end}`;
  });

  /** L'origine n'est dite QUE si elle apprend quelque chose au labo. */
  protected readonly originLabel = computed<string | null>(() =>
    this.sheet().origin === 'recurring' ? ORDER_ORIGIN_LABELS.recurring : null,
  );

  /**
   * **Quand ce papier a été arrêté** — l'unique mention qui manquait à la fiche.
   *
   * Une feuille se réimprime à volonté, y compris après un avenant, et rien ne
   * distinguait deux tirages : deux versions de la même commande pouvaient
   * circuler au fournil sans qu'on sache laquelle est la bonne.
   *
   * « Arrêté » et non « tiré » : l'instant est celui où la révision est devenue
   * vraie, pas celui de l'impression. Deux tirages de la même révision portent
   * donc la même mention, et c'est exactement ce qu'on veut — ce qui distingue
   * deux papiers, c'est la révision, pas l'heure où on a appuyé sur imprimer.
   */
  protected readonly issuedLabel = computed(() => {
    const sheet = this.sheet();
    const at = new Date(sheet.issuedAt);
    const day = at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const time = at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `Arrêté le ${day} à ${time} · révision ${String(sheet.revision)}`;
  });

  /**
   * **Le QR de colisage** — ce que l'atelier scanne pour déclarer la commande
   * prête.
   *
   * Il encode une **URL** et non le numéro nu : c'est ce qui le rend lisible par
   * l'appareil photo natif de n'importe quel téléphone, sans lecteur ni app à
   * installer. L'origine est celle du back-office, d'où la feuille est imprimée.
   *
   * 🔴 **Il n'encode rien que la feuille n'imprime déjà en clair.** Le numéro de
   * commande est trois lignes plus haut, lisible à l'œil. C'est ce qui rend son
   * impression gratuite en exposition — et c'est exactement ce qui interdit d'y
   * mettre le jeton de remise, qui est un secret et dont le papier voyage dans
   * le carton.
   */
  protected readonly packingUrl = computed(
    () => `${globalThis.location.origin}/colisage/${encodeURIComponent(this.sheet().reference)}`,
  );

  /** Le nombre de pièces — de quoi recompter le colis sans additionner. */
  protected readonly pieces = computed(() =>
    this.sheet().lines.reduce((sum, line) => sum + line.quantity, 0),
  );
}
