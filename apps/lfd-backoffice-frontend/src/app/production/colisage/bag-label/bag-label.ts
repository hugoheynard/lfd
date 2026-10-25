import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { PackingBagLabelView, PackingBagLabelsView } from '@lfd/contracts';

import { QrCode } from '../../../shared/qr-code/qr-code';

/**
 * **L'étiquette d'un sac — une page A4, comme celle d'un bac** (2026-10-25,
 * demande de Hugo : « je ne peux pas faire d'étiquette pour les sacs »).
 *
 * Même support que {@link BinLabel} (Q22 : non tranché, une étiquette par
 * page) : quand il le sera, les deux gabarits changent ensemble.
 *
 * Ce qu'on lit de loin : le numéro de commande, en gros ; le client ;
 * l'acheminement précédé du carré de couleur — le libellé et la teinte des
 * papiers du fournil, composés au serveur ; le créneau ; « Sac n/N » quand la
 * commande en a plusieurs. Le QR est celui du RETRAIT de la commande, celui
 * que le comptoir scanne déjà : un sac n'a pas d'identité à lui.
 */
@Component({
  selector: 'app-bag-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QrCode],
  templateUrl: './bag-label.html',
  styleUrl: './bag-label.scss',
})
export class BagLabel {
  /** Ce que toutes les étiquettes de la commande partagent. */
  readonly order = input.required<PackingBagLabelsView>();
  readonly bag = input.required<PackingBagLabelView>();
}
