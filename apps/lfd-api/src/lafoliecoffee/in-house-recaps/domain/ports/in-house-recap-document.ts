/**
 * **Le point d'extension du document** (`plan-restaurants-maison.md`, D10) :
 * appelé après la validation d'un récapitulatif émis ou réémis. Le lot L4 y
 * branche le PDF rangé et l'e-mail ; jusque-là, l'adaptateur ne fait rien.
 * Un échec ici ne défait pas l'émission : le récapitulatif reste, sans PDF.
 */
export abstract class InHouseRecapDocument {
  abstract afterIssued(recapId: string): Promise<void>;
}
