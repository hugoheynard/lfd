import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * **« Il manque » sur un bac complet** (lot E6a, plan
 * `documentation/commandes/plan-e6-le-depart-incomplet.md`, § 3) : toutes les
 * lignes dues sont entièrement réparties, il n'y a rien à signaler.
 */
export class NothingShortError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.shortfall.nothing_short",
      `Toutes les lignes de ${reference} sont entièrement au bac : il ne manque rien. Déclarez-la prête ; si une pièce est abîmée, retirez-la d'abord du contenant, puis signalez le manque.`,
    );
  }
}

/** § 13 : une fiche dont le départ est décidé ne se re-signale pas. */
export class ShortfallAlreadyAuthorizedError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.shortfall.already_authorized",
      `Le départ incomplet de ${reference} est déjà décidé par le commerce : ce qui est au bac part, le reste est abandonné. Fermez le bac.`,
    );
  }
}

/** § 12.2 : la décision arrive sur un bac fermé complet. */
export class ShortfallSheetSealedError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.shortfall.sheet_sealed",
      `Le bac de ${reference} est déjà fermé complet : il n'y a plus de départ incomplet à décider. Rechargez la commande.`,
    );
  }
}

/** § 13 : le contenu du bac n'est plus celui du signal. */
export class ShortfallContentsChangedError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.shortfall.contents_changed",
      `Le bac de ${reference} a changé depuis le signal : rien n'a été décidé. Signalez de nouveau le manque au poste de colisage, puis décidez.`,
    );
  }
}

/** La commande n'a pas de fiche au colisage : la liste n'a pas été tirée. */
export class ShortfallSheetNotFoundError extends BusinessError {
  constructor(orderId: string) {
    super(
      "packing.shortfall.no_sheet",
      `La commande ${orderId} n'a pas de bac au colisage : il n'y a pas de départ incomplet à décider.`,
    );
  }
}
