/** Le numéro d'une commande — ce qui la nomme au journal et dans un refus. */
export abstract class OrderNumbersReader {
  abstract numberOf(orderId: string): Promise<string | null>;
}
