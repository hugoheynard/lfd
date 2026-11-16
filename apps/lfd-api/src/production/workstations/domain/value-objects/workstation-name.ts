import { InvalidWorkstationNameError } from "../errors/workstation-errors.js";

/** Un onglet de fiche porte ce nom : au-delà, il ne tient plus sur la tablette. */
export const WORKSTATION_NAME_MAX_LENGTH = 40;

/**
 * **Le nom d'un poste**, tel que Hugo le donne (« Pâtisserie », « Tourier »).
 *
 * Les espaces de bord sont retirés ; deux noms qui ne diffèrent que par la
 * casse ou ces espaces désignent le même poste (`sameAs`), pour qu'on ne crée
 * pas « Pâtisserie » à côté de « pâtisserie ».
 */
export class WorkstationName {
  private constructor(readonly value: string) {}

  /** @throws {InvalidWorkstationNameError} vide, ou plus long que la borne. */
  static of(raw: string): WorkstationName {
    const value = raw.trim();
    if (value.length === 0) {
      throw new InvalidWorkstationNameError("est vide");
    }
    if (value.length > WORKSTATION_NAME_MAX_LENGTH) {
      throw new InvalidWorkstationNameError(
        `dépasse ${String(WORKSTATION_NAME_MAX_LENGTH)} caractères`,
      );
    }
    return new WorkstationName(value);
  }

  sameAs(other: WorkstationName): boolean {
    return this.comparable() === other.comparable();
  }

  private comparable(): string {
    return this.value.toLocaleLowerCase("fr-FR");
  }
}
