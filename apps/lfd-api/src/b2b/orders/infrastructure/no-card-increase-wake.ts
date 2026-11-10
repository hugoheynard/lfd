import { Injectable } from "@nestjs/common";

import { CardIncreaseWake } from "../domain/ports/card-increase-wake.js";

/**
 * Le réveil vide du lot S2.a (plan S2, §2.10) : l'exécuteur n'existe pas
 * encore. Le projet `ready` attend en base ; S2.c remplace cette liaison.
 */
@Injectable()
export class NoCardIncreaseWake extends CardIncreaseWake {
  wake(): Promise<void> {
    return Promise.resolve();
  }
}
