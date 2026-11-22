import type { BankTransferGap } from "../services/bank-transfer-consistency.js";

/**
 * Fait en mémoire : **le contrôle de cohérence a trouvé un écart** entre la
 * trace de la facturation et le virement enregistré par le bloc `payment`. Il
 * ne sert qu'à sonner la cloche ; la ligne au journal technique est écrite
 * par le contrôle lui-même.
 */
export class BankTransferGapFoundEvent {
  constructor(readonly gap: BankTransferGap) {}
}
