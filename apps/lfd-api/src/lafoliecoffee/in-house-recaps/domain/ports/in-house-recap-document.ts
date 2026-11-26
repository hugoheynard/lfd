/**
 * **Le document d'un récapitulatif** (`restaurants-maison.md`) :
 * appelé après la validation d'un récapitulatif émis ou réémis, il range le
 * PDF et demande l'e-mail. Un échec ici ne défait pas l'émission : le
 * récapitulatif reste, sans PDF, et « Renvoyer l'e-mail » le rattrape.
 */
export abstract class InHouseRecapDocument {
  abstract afterIssued(recapId: string): Promise<void>;
}
