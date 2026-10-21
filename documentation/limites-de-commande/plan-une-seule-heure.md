# Plan — une seule heure : l'arrêt du plan suit l'heure limite

> **Bâti le 2026-10-21 (lot 2 : serveur, back-office, docs), non commité à
> l'écriture de ce bandeau.** L'état vit dans
> [`../production/arret-du-plan.md`](../production/arret-du-plan.md) et
> [`reglages-generaux.md`](reglages-generaux.md) ; ce plan garde les décisions
> (§4–§6), que le code cite. Aucune migration : les colonnes `close_mode`,
> `close_at`, `alert_at` et `order_cutoff_settings.enabled` restent en base,
> ni lues ni écrites.
>
> Écrit doc-first le 2026-10-21. Point 5 du
> [`schema-des-reglages.md`](schema-des-reglages.md) ; décision de Hugo du
> 2026-10-21 : « une seule heure, qu'on met dans l'heure limite ; le réglage du
> fournil doit s'adapter ». À bâtir APRÈS le lot « une seule limite générale /
> limite par produit » (mêmes règles touchées).

## 0. Ce qui existe (ouvert le 2026-10-21)

- **L'heure limite générale** : une règle (après le lot en cours, une seule),
  `public.order_cutoffs`, « N jours avant, HH:MM » + rattrapage, et
  l'interrupteur `order_cutoff_settings` — doc
  [`reglages-generaux.md`](reglages-generaux.md).
- **L'arrêt du plan** ([`../production/arret-du-plan.md`](../production/arret-du-plan.md)) :
  `production.production_settings` (`close_mode` `auto` | `manual`, `close_at`
  pour l'automatique, `alert_at` pour l'alerte du manuel), le tour
  `admin/production/auto-close` toutes les cinq minutes, l'arrêt manuel à
  l'écran. Un plan arrêté refuse les commandes client du jour
  (`orders.production_plan_closed`) et le jour n'est plus proposé ; l'équipe
  passe « hors plan ». En prod : aucune ligne de réglage, donc **manuel, alerte
  à 20:00** (lu le 2026-10-21).
- **Le fournil lit déjà l'heure limite** par son canal :
  `production/channels/commerce/order-cutoff-rules.reader.ts` et
  `order-cutoff-switch.reader.ts` — déclarés par le fournil, implémentés par
  le commerce (`production → b2b` reste interdit).

## 1. Ce qu'on bâtit

**L'heure limite est la seule heure.** Pour le client comme pour le fournil.

- **Arrêt automatique = l'heure limite.** Le plan du jour J s'arrête tout seul
  à la fin du rattrapage de la règle générale pour J (l'instant où plus aucune
  commande client ne peut passer). Plus d'heure `close_at` à part.
- **Pas d'arrêt avant l'heure limite** pour les commandes client : un arrêt
  manuel anticipé est refusé avec un message qui dit l'heure limite et où la
  changer. (À trancher, Q1 : refuser, ou accepter en prévenant que la boutique
  continuera d'annoncer l'heure limite ?)
- **Rouvrir reste possible**, et l'équipe saisit toujours « hors plan ».
- **Interrupteur coupé** (pas d'heure limite) : l'arrêt redevient manuel, avec
  son alerte — il faut bien figer le plan un jour. (À trancher, Q2.)
- **L'écran du fournil** ne règle plus d'heure : il affiche « Arrêt automatique
  à l'heure limite : la veille, 23 h — se règle dans Réglages › Commandes ».

## 2. Les lots

| Lot    | Contenu                                                                                                                                                                                            | Agent     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **H1** | Fournil serveur : le tour d'arrêt automatique calcule l'instant depuis la règle générale (canal existant) ; `close_at` ignoré (colonne gardée) ; refus d'un arrêt anticipé (selon Q1) ; tests, e2e | batisseur |
| **H2** | Back-office : l'écran de production n'a plus d'heure, il affiche l'heure limite en lecture avec le lien ; l'écran de l'heure limite dit « le plan du fournil s'arrête à cette heure »              | pablo     |
| **H3** | Doc : `arret-du-plan.md`, `reglages-generaux.md`, schéma §4 point 5                                                                                                                                | batisseur |

## 3. Questions

- **Q1** — Un arrêt manuel AVANT l'heure limite : refusé, ou accepté avec un
  avertissement ?
- **Q2** — Heure limite désactivée : arrêt manuel avec alerte (comme
  aujourd'hui), ou automatique à une heure de secours ?
- **Q3** — L'arrêt automatique se fait-il à l'heure limite, ou à la FIN du
  rattrapage ? (Proposé : fin du rattrapage — sinon une commande passée dans le
  rattrapage avec dérogation arriverait sur un plan déjà figé.)

## 4. Décisions (Hugo, 2026-10-21)

- **Q1** — Un arrêt manuel avant l'heure limite est **refusé** : pour figer
  plus tôt, on avance l'heure limite ; le refus le dit, avec le lien.
- **Q2** — Heure limite désactivée : **arrêt manuel + alerte**, comme
  aujourd'hui.
- **Q3** — L'arrêt automatique se fait à la **fin du rattrapage**.

## 5. Révision de Hugo (2026-10-21) — l'emporte sur les §1, §2 et Q2

« Manuel / automatique n'a plus de sens : on reste sur l'heure limite générale,
et elle déclenche tout. »

- **Plus de mode** : `close_mode`, `close_at` et `alert_at` ne servent plus
  (colonnes gardées, ignorées). Le plan du jour J s'arrête TOUJOURS seul, à la
  fin du rattrapage de l'heure limite générale pour J. Il n'y a plus d'arrêt
  manuel ni d'alerte du soir ; le fournil garde **rouvrir**, et l'équipe saisit
  toujours « hors plan ».
- **L'interrupteur de l'heure limite disparaît** (point 7 du schéma) : une heure
  limite qu'on coupe ne déclencherait plus l'arrêt du plan. L'heure limite est
  toujours en vigueur. (Proposé par Claude, implicite dans la décision de Hugo —
  à confirmer à la relecture du lot.)
- **Le texte de l'écran dit la conséquence** (Hugo) : le titre du réglage
  devient « Heure limite générale — arrêt du plan de production pour le
  lendemain », et la carte explique que, passé cette heure (rattrapage compris),
  la boutique ne prend plus de commande pour le lendemain ET le plan du fournil
  se fige : liste à coliser, tournées, paiements en suspens annulés.
- **L'écran de production** affiche l'heure de l'arrêt en lecture, avec le lien
  vers Réglages › Commandes.

## 6. Le jour même garde son réglage, sur sa propre page (Hugo, 2026-10-21)

« Le réglage autoriser le jour même devra avoir sa page, car nous y
réfléchirons après. » Il ne disparaît PAS avec l'interrupteur : il quitte
l'écran de l'heure limite pour une page à lui (Réglages › Commandes › Jour
même), avec le même droit `lfc_order_settings` et le même comportement
(`order_cutoff_settings.same_day_allowed`) — le temps de le repenser avec la
commande à J sur stock (schéma §0). Fait partie du lot 2 (H2).
