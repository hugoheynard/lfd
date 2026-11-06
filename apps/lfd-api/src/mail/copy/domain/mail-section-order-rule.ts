import { InvalidMailSectionOrderError } from "./mail-copy-errors.js";
import {
  defaultSectionOrder,
  MAIL_FRAMES,
  type MailLayoutDescription,
} from "./mail-section-layout.js";

/**
 * **Un ordre de sections valide** pour un e-mail (plan
 * `plan-textes-des-e-mails.md`, E4, S2) : chaque section déclarée, une fois et
 * une seule — ni oubliée, ni doublée, ni inventée —, et aucun des deux cadres.
 *
 * Une section oubliée ne disparaîtrait pas de l'e-mail (la coquille la remet
 * à sa place par défaut) : elle se retrouverait là où personne ne l'a mise.
 * C'est pour ça qu'un ordre partiel est refusé ici plutôt que complété.
 *
 * @throws {InvalidMailSectionOrderError} en nommant ce qui ne va pas, et la liste attendue.
 */
export function validSectionOrder(
  layout: MailLayoutDescription,
  order: readonly string[],
): readonly string[] {
  const expected = defaultSectionOrder(layout);
  const frames = order.filter((id) => (MAIL_FRAMES as readonly string[]).includes(id));
  if (frames.length > 0) {
    throw new InvalidMailSectionOrderError(
      layout.mail,
      "l'en-tête et le recours restent à leur place, en tête et en bas de l'e-mail ; seules les sections entre les deux se déplacent.",
    );
  }
  const unknown = order.filter((id) => !expected.includes(id));
  const doubled = [...new Set(order.filter((id, index) => order.indexOf(id) !== index))];
  const missing = expected.filter((id) => !order.includes(id));
  if (unknown.length + doubled.length + missing.length > 0) {
    const problems = [
      ...(unknown.length > 0 ? [`${unknown.join(", ")} n'est pas une section de cet e-mail`] : []),
      ...(doubled.length > 0 ? [`${doubled.join(", ")} apparaît deux fois`] : []),
      ...(missing.length > 0 ? [`il manque ${missing.join(", ")}`] : []),
    ];
    throw new InvalidMailSectionOrderError(
      layout.mail,
      `${problems.join(" ; ")}. Sections attendues, chacune une fois : ${expected.join(", ")}.`,
    );
  }
  return order;
}

/** L'ordre tient-il encore contre les sections que le code déclare ? */
export function keepsSections(layout: MailLayoutDescription, order: readonly string[]): boolean {
  const expected = defaultSectionOrder(layout);
  return (
    order.length === expected.length &&
    new Set(order).size === order.length &&
    order.every((id) => expected.includes(id))
  );
}
