/**
 * **Le sujet d'un mouvement d'argent**, vu du bloc `payment` : un type et un
 * identifiant opaques que l'appelant possède (`invoice` pour le virement
 * reçu). Distinct de `CardSubject`, le type du port de la carte : un sujet de
 * virement n'a pas à être un sujet que la carte sait régler.
 */
export interface MovementSubject {
  readonly type: string;
  readonly id: string;
}

/**
 * La clé d'un sujet dans une table de lecture rendue par le bloc : le type et
 * l'identifiant, pour que deux sujets de types différents ne se confondent
 * jamais sous le même identifiant.
 */
export function movementSubjectKey(subject: MovementSubject): string {
  return `${subject.type}/${subject.id}`;
}
