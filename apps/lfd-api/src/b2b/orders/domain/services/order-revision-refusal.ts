import type { CancellationBlock } from "./order-cancellation.js";

const MODIFY_ACCOUNTING =
  "Une commande engagée en comptabilité ne se modifie plus : voyez avec la comptabilité.";

/** `AAAA-MM-JJ` → `JJ/MM`, sans fuseau : un jour de service n'en a pas. */
function shortDay(day: string): string {
  const [, month = "", dayOfMonth = ""] = day.split("-");
  return `${dayOfMonth}/${month}`;
}

/**
 * **La phrase du refus d'une modification** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, R1) — la même
 * frontière que l'annulation (`cancellationOf`), dite avec le geste qu'on
 * refuse. Lue par du personnel et par le client, sans le code sous les yeux :
 * elle nomme le cas et ce qu'on peut faire à la place.
 */
export function revisionRefusalOf(block: CancellationBlock): string {
  switch (block.kind) {
    case "already_cancelled":
      return "Cette commande est annulée : elle ne se modifie plus. Passez une nouvelle commande.";
    case "draft":
      return "Cette commande est un brouillon : elle n'est pas passée, il n'y a rien à modifier.";
    case "ready":
      return "Cette commande est déjà prête : elle ne se modifie plus. Voyez avec le fournil.";
    case "fulfilled":
      return "Cette commande est déjà retirée : elle ne se modifie plus.";
    case "inscribed":
      return block.day === null
        ? "Le fournil a déjà inscrit cette commande au compte à produire : elle ne se modifie plus. Voyez avec le fournil."
        : `Le fournil a déjà inscrit cette commande au compte à produire du ${shortDay(block.day)} : elle ne se modifie plus. Voyez avec le fournil.`;
    // Plan A1 : refus de l'annulation au-delà de l'inscription, jamais
    // rendu par la modification — dit quand même.
    case "delivery_after_plan":
      return "Cette commande est déjà au colisage : elle ne se modifie plus. Voyez avec le fournil.";
    // Plan A2 : rendus par le guichet du colisage, sous le verrou de la feuille.
    case "packed":
      return "Le bac de cette commande est déjà fermé au colisage : elle ne se modifie plus. Voyez avec le colisage.";
    case "delivery_bin":
      return "Cette commande est déjà dans un bac de livraison : ses quantités ne se modifient plus. Retirez-la du bac au poste de colisage, puis refaites la modification.";
    case "state_changed":
      return "L'état de cette commande a changé pendant la modification : rien n'a été modifié. Rechargez-la.";
    case "refund_in_flight":
    case "paid_just_now":
      return "Cette commande a un règlement par carte en cours : elle ne se modifie pas. Annulez-la et recommandez, ou demandez au commerce.";
    case "invoiced":
    case "collecting":
    case "collected":
    case "written_off":
    case "returned_before":
    case "settled_otherwise":
      return MODIFY_ACCOUNTING;
    case "engagement_unknown":
      return "L'état de facturation de cette commande n'a pas pu être lu : rien n'a été modifié. Signalez-le à l'équipe technique.";
    case "voucher_remainder_engaged":
    case "voucher_remainder_cancelled":
      return "Le bon de fidélité de cette commande a déjà servi ailleurs : elle ne se modifie pas. Voyez avec le commerce.";
  }
}
