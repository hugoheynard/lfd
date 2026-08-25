import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Journal } from "../../../platform/journal/journal.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { pricingFactOf, type PricingAct } from "../domain/pricing-act.js";
import { eventRow } from "./pricing-journal.writer.js";

/**
 * **L'écriture d'un acte tarifaire, et ses deux journaux.**
 *
 * Chaque dépôt d'écriture répétait la même ligne — créer la ligne de
 * `pricingEvent` dans sa transaction — et aucun n'écrivait au journal général.
 * Les deux manques ont la même cause : personne ne possédait « écrire un acte ».
 *
 * Ce service le possède. L'état, l'acte du domaine et son miroir général
 * partent dans **une** transaction : ils tombent ensemble ou ils tiennent
 * ensemble. Un prix négocié dont le journal aurait perdu l'auteur serait pire
 * qu'un prix non enregistré — le premier se voit, le second se croit.
 */
@Injectable()
export class PricingActWriter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * Exécute l'écriture d'état, puis inscrit l'acte aux deux journaux.
   *
   * L'état d'ABORD : un acte qui décrit une écriture refusée (chevauchement de
   * règles, ligne absente) ne doit pas exister. La transaction le garantirait de
   * toute façon ; l'ordre le rend lisible.
   */
  async around<T>(act: PricingAct, writeState: () => Promise<T>): Promise<T> {
    return await this.uow.run(async () => {
      const result = await writeState();
      await this.inscribe(act);
      return result;
    });
  }

  /**
   * Comme {@link around}, mais l'acte n'est inscrit **que si l'écriture a fait
   * quelque chose**.
   *
   * Deux personnes peuvent avoir le même écran ouvert. La seconde qui archive
   * une limite déjà retirée ne change rien : lui écrire un acte ferait raconter
   * au journal un geste qui n'a pas eu lieu — et c'est le genre de ligne qu'on
   * croit, six mois plus tard, faute de pouvoir la vérifier.
   */
  async aroundChange(act: PricingAct, writeState: () => Promise<boolean>): Promise<boolean> {
    return await this.uow.run(async () => {
      if (!(await writeState())) {
        return false;
      }
      await this.inscribe(act);
      return true;
    });
  }

  /** L'acte du domaine, puis son miroir général. */
  private async inscribe(act: PricingAct): Promise<void> {
    await this.prisma.pricingEvent.create({ data: eventRow(this.ids.next(), act) });
    await this.journal.append(pricingFactOf(act));
  }
}
