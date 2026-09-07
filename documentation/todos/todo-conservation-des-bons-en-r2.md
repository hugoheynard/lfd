# TODO — combien de temps garde-t-on les bons de commande en R2 ?

**Ouvert le 2026-09-07**, en livrant le PDF du bon de commande (lot 8 de
[`../order/architecture-bon-de-commande.md`](../order/architecture-bon-de-commande.md)).

## Le fait

Le bon de commande PDF est rangé dans le stockage objet sous une clé qui porte
la **révision** :

```
orders/{orderId}/bon-de-commande-r{revision}.pdf
```

La révision est dans la clé pour une raison qui ne se négocie pas : le port du
stockage dit qu'« une même clé écrase », et un chemin sans révision ferait
disparaître, au premier avenant, le seul document que le client peut opposer.

**Conséquence directe : rien ne s'écrase jamais.** Le stockage ne fait que
croître, et chaque avenant y ajoute une pièce de plus pour la même commande.

## Ce qui a changé le 2026-09-07, et qui rend la question moins théorique

Le plan disait « écrit au **premier téléchargement** », et l'argument tenait sur
un pari : l'immense majorité des commandes ne verrait jamais son PDF demandé.

Ce pari **tombe** dès que le courriel de confirmation joint le bon — ce qui est
l'étape suivante, et une bonne idée par ailleurs. Un courriel part à **chaque**
commande ; si le bon y est joint, il est produit à chaque commande. On passe
d'une fraction des commandes à leur totalité, et la paresse du premier
téléchargement ne protège plus rien.

Le geste qui rend le produit meilleur est donc celui qui rend cette question
urgente. C'est pour ça qu'elle est écrite maintenant, avant d'être découverte
dans une facture.

## L'ordre de grandeur

Un bon de deux articles pèse **~2,5 Ko**. Une commande de cinquante lignes tient
sous 10 Ko. À mille commandes par jour — très au-dessus du réel — c'est de
l'ordre de **quelques mégaoctets par jour**, quelques gigaoctets sur des années.

Rien ne presse, et c'est précisément pourquoi ce fichier existe plutôt qu'un
chantier : une question qui ne fait pas mal ne se pose jamais toute seule.

## Ce qu'il faudra trancher, et dans quel ordre

1. **La durée légale d'abord, la technique ensuite.** On ne purge pas une pièce
   qu'un client peut opposer sans savoir combien de temps il a le droit de
   l'opposer. Un bon de commande n'est pas une facture — le pied du document le
   dit en toutes lettres — mais il porte des montants convenus. La réponse est
   **comptable avant d'être technique**, et elle ne s'invente pas ici.
2. **Purger, ou cesser de produire ?** Deux leviers, et le second est plus
   propre : ne ranger que ce qui a été **demandé** (le PDF joint au courriel
   pourrait n'être qu'un rendu à la volée, non archivé), et n'archiver que les
   révisions **> 0**, celles qui existent parce qu'un avenant a corrigé quelque
   chose. Un bon de révision 0 se reconstitue à l'identique tant que la commande
   n'a pas bougé — c'est toute la propriété du rendu déterministe.
3. **Une règle de cycle de vie R2** (`lifecycle rule`) plutôt qu'un
   planificateur applicatif : l'API n'en a aucun, et en introduire un pour
   supprimer des fichiers serait un mécanisme de plus à surveiller.

## Le piège à ne pas tomber dedans

Une purge « au bout de N mois » qui supprime **la dernière** révision d'une
commande retire au client le seul document qu'il pouvait produire. Si purge il y
a, elle doit garder au minimum la révision la plus haute de chaque commande — ou
alors ne rien garder du tout et tout reconstituer, ce qui n'est possible que
pour les commandes **sans avenant**.

Les deux options sont défendables ; la moitié de chacune ne l'est pas.
