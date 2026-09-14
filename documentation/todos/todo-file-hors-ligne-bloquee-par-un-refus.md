# TODO — une file hors ligne se bloque à vie sur un refus définitif

> ⚠️ **Sans objet depuis le 2026-09-14, le jour de sa résolution.** Les deux
> files hors ligne ont été **retirées** : le fournil a toujours du réseau, et la
> file coûtait plus de problèmes qu'elle n'en évitait (décision de Hugo). Une
> coche part désormais directement au serveur. Ce qui suit reste comme trace de
> ce qui a été constaté — le code qu'il décrit n'existe plus.

> ✅ **Soldée le 2026-09-14**, le lendemain de son ouverture. Elle ne s'est pas
> contentée d'être théorique : elle a bloqué le fournil au **premier vrai
> usage**, en dev — une ligne cochée avant l'arrêt du plan retenait toutes les
> coches d'après, et elles disparaissaient au rechargement. Hugo a décidé de la
> traiter aussitôt.
>
> **Ce qui a été fait**, et qui suit le piège écrit plus bas :
>
> - queue-refusal.ts (retiré depuis) portait **la**
>   décision, partagée par les deux files : réseau, 5xx, 401, 408, 425, 429 → on
>   garde ; tout autre 4xx → refus définitif. **Une erreur qu'on ne sait pas lire
>   est gardée**, jamais écartée : écarter est le seul choix irréversible.
> - Un refus définitif **sort de la file, et le vidage continue** — un 409 sur
>   une ligne ne dit rien de la suivante.
> - Il ne disparaît pas en silence : la file l'expose (`rejected`), l'écran
>   retire la coche locale et affiche le refus avec le message du serveur, et
>   « Compris » en prend acte. C'est le piège nommé ci-dessous, et il est tenu.
> - Un refus visant un geste **déjà remplacé** (ligne recochée pendant l'envoi)
>   n'est pas affiché : il masquerait la coche la plus récente.
> - Une file déjà empoisonnée se remet seule au prochain chargement de l'écran.
>
> Le texte d'origine suit, inchangé — il dit pourquoi.

**Ouvert le 2026-09-13**, en bâtissant le poste de colisage. Trouvé en
cherchant, pas en production : aucun incident connu à ce jour.

## Le fait

`WorksheetQueue` (fiche d'atelier) et `PackingQueue` (colisage) partagent le
même `drain()` : il **s'arrête au premier échec et laisse le geste en tête de
file**. C'est le bon comportement pour une panne réseau — le fournil est en
sous-sol, l'ordre des gestes compte, et ce qui n'est pas parti repart à la
reconnexion.

Ce n'est pas le bon comportement pour un refus **définitif**. Un `409` que le
serveur rendra toujours — cocher une ligne pas encore sortie du four, toucher
une commande déjà déclarée prête — produit une entrée que rien ne fera jamais
passer. Elle reste en tête ; chaque geste suivant rappelle `flush()`, qui
réessaie la même entrée empoisonnée, échoue, et rend la main.

**Conséquences** : la file ne se vide plus jamais, tout geste postérieur est
bloqué derrière, et le pied de l'écran compte « N gestes en attente » pour
toujours — c'est-à-dire que l'écran dit la vérité sur un état dont personne ne
peut sortir.

Pas de boucle folle ni de tempête réseau : **une seule tentative par vidage**.

## Ce qui protège aujourd'hui, et jusqu'où

Le poste de colisage refuse déjà, côté écran, de mettre en file une coche sur
une ligne en attente de production (`packing-board.ts`). Ça empêche d'en
**créer** un depuis cette version — ça ne répare pas une file déjà empoisonnée,
et ça ne couvre pas les autres refus définitifs.

## Pourquoi ce n'est pas corrigé tout de suite

Distinguer un refus **rattrapable** (réseau, 5xx) d'un refus **définitif** (4xx)
demande de faire remonter le statut HTTP depuis le service jusqu'à la file. Les
deux files ont le même `drain` : c'est **une décision, deux fichiers**, et la
prendre sur l'un seulement ferait diverger deux mécanismes que leur jumelage
rend aujourd'hui relisables.

Décision de Hugo le 2026-09-13 : **dette écrite, à traiter plus tard.**

## Le piège, le jour où on le fera

Jeter l'entrée refusée ne suffit pas. Un geste qui disparaît sans laisser de
trace est pire que le blocage actuel : l'écran affiche alors une coche que le
serveur n'a jamais acceptée, et **plus rien ne le dit**. Ce qui est écarté doit
se voir — et la coche locale correspondante doit être reprise, sinon l'écran
ment sur ce qu'il a enregistré, ce que ces deux files existent précisément pour
empêcher.
