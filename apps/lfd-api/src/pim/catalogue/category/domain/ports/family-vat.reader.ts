/**
 * **Les taux propres d'une famille**, par clé de contexte (identifiants de
 * taux) — ce que la résolution du taux effectif d'une fiche lit de sa famille.
 *
 * `undefined` = famille inconnue : un rattachement cassé n'est pas une famille
 * non réglée, et l'appelant le refuse (`CategoryNotFoundError`).
 */
export abstract class FamilyVatReader {
  abstract vatOf(categoryId: string): Promise<Readonly<Record<string, string>> | undefined>;
}
