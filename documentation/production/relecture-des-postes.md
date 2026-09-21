# La relecture des postes du fournil

_Écrit le 2026-09-14. État : implémenté — fiche d'atelier et poste de colisage. Sans file hors ligne (retirée le même jour)._

## Le problème

Le fournil coche à **plusieurs postes** la même journée : un téléphone au
pétrin, un poste au four, un autre au colisage. Jusqu'au 2026-09-14, chaque
écran lisait le serveur **une seule fois**, à son ouverture. Un poste resté
allumé ne voyait donc jamais ce que les autres cochaient : une ligne sortie du
four par le voisin restait « à faire » ici, et c'est ainsi qu'on fabrique deux
fois — ou qu'on répartit deux fois la même marchandise.

## Ce qui est fait : une relecture, pas une websocket

Chaque poste **se relit toutes les 15 secondes tant que son onglet est
visible**, et **tout de suite** quand on revient dessus.
Code : `apps/lfd-backoffice-frontend/src/app/production/periodic-refresh.ts`.

| Règle                            | Pourquoi                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 15 s                             | le temps de sortir une plaque et de revenir à l'écran ; plus court ne se verrait pas, plus long laisserait deux postes cocher la même ligne |
| rien quand l'onglet est caché    | un poste oublié derrière une fenêtre n'interroge pas le serveur toute la nuit                                                               |
| relecture immédiate au retour    | un écran retrouvé après deux heures ne montre pas quinze secondes de périmé                                                                 |
| jamais deux relectures à la fois | au sous-sol, une lecture peut durer plus qu'un intervalle                                                                                   |
| un numéro de lecture             | une réponse lente n'écrase jamais une lecture partie après elle                                                                             |

La relecture est **silencieuse** : pas d'écran de chargement, et rien de ce que
la personne a choisi ne bouge — rayon ouvert, pile, recherche, commande ouverte.

### Pourquoi pas une websocket, et ce qu'il faudrait pour y passer

Le besoin d'une diffusion en direct est réel. Mais l'API est **sans état** et
peut tourner en **plusieurs instances** : un client connecté à l'une ne
recevrait rien de ce qu'une autre diffuse. Une websocket demande donc d'abord
un **point de diffusion commun à toutes les instances** (un Durable Object, par
exemple) — c'est un chantier d'infrastructure, pas un écran. Le bus
d'événements de l'API ne peut pas servir de relais : il vit en processus, et
n'est ni persisté ni rejoué.

La relecture couvre le besoin à une fraction du coût. **À reconsidérer le jour
où quinze secondes de décalage coûtent quelque chose de réel au fournil.** Ce
jour-là, la règle ci-dessous reste valable telle quelle : une notification ne
fait que déclencher une relecture plus tôt.

## Une coche part tout de suite, et une relecture ne la défait pas

🔴 **Il n'y a plus de file hors ligne depuis le 2026-09-14.** Décision de Hugo :
le fournil a toujours du réseau, et la file — stockée dans le navigateur,
rejouée à la reconnexion — coûtait plus de problèmes qu'elle n'en évitait. Elle
avait bloqué le poste de dev au premier vrai usage, et chaque correctif en
appelait un autre. On est allé à l'essentiel.

Une coche part donc **directement** au serveur :

- pendant l'envoi, la case est désarmée — un second clic enverrait un geste
  contraire qui pourrait arriver avant le premier ;
- **acceptée**, elle est inscrite dans ce que l'écran a lu ;
- **refusée ou sans réponse**, la case revient en arrière et l'écran dit
  pourquoi, avec le message du serveur.

Le seul piège qui reste est une question d'ordre : une relecture partie
**avant** une écriture et revenue **après** rendrait l'état d'avant, et
décocherait la case sous les doigts. **Toute réponse de relecture dont le départ
précède la dernière écriture acceptée est jetée** — la suivante, quinze
secondes plus tard, la contiendra. Le compte de containers du colisage suit la
même règle.

## Ce qui change sous les yeux, et qui se dit

Un écran qui bouge sans raison fait douter de ce qu'on a cliqué. Trois cas se
disent en toutes lettres :

- **la fiche change de journée** — le soir, quand le plan du lendemain est
  arrêté, la relecture fait passer la fiche à demain (c'est la règle de la
  journée travaillée, réappliquée à chaque relecture). Un avis le dit ;
- **la commande ouverte a été déclarée prête sur un autre poste** — la
  relecture la range dans les prêtes et l'écran enchaîne sur la suivante. Un avis
  nomme la commande ;
- **de quand date l'écran** — le pied dit « relue à 4 h 12 », ou « relecture
  impossible depuis 4 h 12 ». Une relecture ratée ne vide jamais l'écran, mais
  un écran figé qui a l'air à jour ferait cocher deux fois la même ligne.

## Ce qui n'est pas couvert

- **Le catalogue** (les rayons de la fiche) n'est relu qu'à l'ouverture : il
  change quelques fois par an, pas pendant une fournée.
- **Deux postes qui cochent la même ligne dans le même quart de minute** se
  croisent toujours — le dernier geste arrivé au serveur gagne, comme avant. La
  relecture réduit la fenêtre, elle ne la ferme pas ; seule une diffusion en
  direct le ferait.
