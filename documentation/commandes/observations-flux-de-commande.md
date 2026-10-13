# Observations du flux de commande

> **Ce que c'est** : le carnet des constats faits en passant de vraies
> commandes, au moment où on les fait. Une ligne par constat, datée, avec son
> sort. Ce n'est ni un plan ni une doc d'état : un constat traité renvoie au
> commit ou au document qui l'a pris, et s'arrête là.
>
> Le flux de référence est [`flux-de-commande.md`](flux-de-commande.md).

## 2026-10-13 — commande pro en livraison, par Hugo

| #   | Constat                                                                                                                                         | Cause relevée                                                                                                            | Sort                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| O1  | « Je croyais commander pour demain, et j'ai deux commandes pour jeudi. » Aucun avertissement quand la limite du lendemain est passée.           | Limite « la veille à 19:00 » passée : le premier jour possible devient le surlendemain, sans que l'écran le dise.        | 🔨 en cours : avertissement dans la barre, le panier et le règlement, date en toutes lettres |
| O2  | En livraison, impossible de choisir le jour.                                                                                                    | Le retrait a « Changer l'heure » ; la livraison n'a aucun geste équivalent.                                              | 🔨 en cours : choix parmi les jours livrables                                                |
| O3  | En livraison, la barre centrale dit « Changer de maison ».                                                                                      | `order-bar.html` affiche les mêmes deux gestes quel que soit le mode, et les deux mènent au dialogue de livraison.       | 🔨 en cours : « Changer d'adresse » / « Changer le jour »                                    |
| O4  | « Régler » mène directement à la confirmation, sans le récapitulatif du panier ni le choix « au compte » / « carte » du pro.                    | `shop-page.ts` `pay()` n'ouvre le panier que pour un visiteur ; connecté, il passe la commande tout de suite.            | 🔨 en cours : « Régler » ouvre toujours le récapitulatif                                     |
| O5  | Une commande a pu être passée pour le jeudi 15 alors que le plan de production de ce jour était **arrêté**.                                     | **Non vérifiée.** Hypothèse : la passation ne lit que l'heure limite, pas l'état de la journée du fournil.               | ❓ à instruire : faut-il refuser, ou reporter au jour suivant ?                              |
| O6  | Pro inscrit, entré directement par la boutique sans avoir choisi retrait ou coursier : « Régler » ouvre « Où je la prends » (retrait) d'office. | `shop-page.ts` `pay()` appelle `doors.pickup(null)` quand aucun service n'est posé : la livraison n'est jamais proposée. | 🔨 en cours : un premier dialogue « Retrait ou coursier ? », puis la porte choisie           |
