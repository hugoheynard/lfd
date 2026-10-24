/**
 * **Une commande peut-elle viser aujourd'hui ?** — le réglage admin « Autoriser
 * les commandes pour le jour même » (Réglages › Commandes › Heure limite, plan
 * `documentation/commandes/passation/plan-reglages-commandes.md` §8.3, Hugo 2026-10-14).
 *
 * Port étroit (ISP) : la passation ne lit que ce booléen du réglage.
 */
export abstract class SameDayOrderReader {
  abstract allowed(): Promise<boolean>;
}
