import { PICKUP_CHOICE_REQUIRED } from "@lfd/contracts";

import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un retrait **sans point choisi**, alors qu'aucun ne s'impose (**409**) :
 * plusieurs points sont ouverts à la clientèle et la société n'en préfère
 * aucun parmi eux (`preselectedPickupId`, Hugo 2026-10-15). Il n'y a plus de
 * « site par défaut » pour décider à la place du client.
 */
export class PickupChoiceRequiredError extends BusinessError {
  constructor(readonly offered: number) {
    super(
      PICKUP_CHOICE_REQUIRED,
      `${String(offered)} points de retrait vous sont ouverts : choisissez celui où retirer la commande, puis validez à nouveau.`,
    );
  }
}
