# Qui porte le risque ? — **prix vivant** et **prix bloqué**

**État : 🔵 note de conception, ZÉRO code.** Écrite le 2026-08-17, après la
livraison du plancher à deux étages. Rien de ce qui suit n'est implémenté ; ce
document sert à trancher avant de coder, parce que le choix engage la façon dont
un prix se résout et dont une commande se relit.

Voisins :

- [`architecture-resolution-de-prix.md`](architecture-resolution-de-prix.md) —
  les étages, le plancher, l'élasticité. **Ce document ne les rediscute pas** :
  il ajoute une question que ce modèle ne posait pas, celle de savoir **qui
  subit** un changement de prix ;
- [`architecture-commande-immuable-avenants.md`](architecture-commande-immuable-avenants.md)
  — une commande est un fait clos. C'est de là que vient le gel du prix à la
  passation, et c'est ce gel que le prix bloqué étend à toute une saison.

---

## Le problème, en une phrase

Le modèle actuel sait dire **combien** coûte un article. Il ne sait pas dire
**qui encaisse la variation** quand le coût de la maison bouge.

Aujourd'hui, quand les overheads montent en cours de saison — la farine, le
beurre, l'électricité du fournil, un salaire de plus — on relève le tarif de
liste et **tous les clients le subissent au même instant**. C'est le seul
comportement possible, faute d'avoir jamais nommé l'autre.

L'autre existe pourtant, et il est courant.

---

## L'analogie qui rend le sujet lisible : le contrat brasseur

Un brasseur vend sa bière de deux façons, et tout le métier tient dans l'écart
entre les deux.

**Le café qui achète au coup par coup.** Il commande ce qu'il veut, quand il
veut, au tarif du jour. Le brasseur augmente en mars ? Le café paie le nouveau
prix dès la commande suivante. Liberté totale des deux côtés, et **c'est
l'acheteur qui porte le risque de prix**.

**Le café sous contrat de volume.** Il s'engage sur 40 hectolitres sur douze
mois, à un prix arrêté à la signature. Le brasseur augmente en mars ? Ce
café-là ne bouge pas : il a **acheté la stabilité**, et il l'a payée en
s'engageant sur un volume. Si les cours du malt s'envolent, **c'est le brasseur
qui porte le risque** — et il l'accepte parce que le volume garanti absorbe ses
frais fixes.

Le second contrat n'est pas une faveur : c'est un **échange de risques**. Le
client échange sa liberté de volume contre une garantie de prix ; le brasseur
échange sa liberté de prix contre une garantie de volume.

Une boulangerie qui livre des hôtels de station est exactement dans cette
position. Un hôtel qui prend 300 viennoiseries tous les matins de décembre à
avril **veut** un prix ferme pour construire son budget. Un restaurant qui
commande au gré de son taux de remplissage **veut** le tarif du jour et aucune
obligation.

---

## Un mot sur le nom

Ces deux chemins se sont d'abord appelés « vendor lock » et « buyer lock ». Le
nom a été abandonné pour une raison qui n'est pas cosmétique : en informatique,
_vendor lock-in_ désigne le **client** prisonnier de son fournisseur — soit
exactement l'inverse de ce que « vendor lock » voulait dire ici. Un vocabulaire
qui piège son lecteur au premier contact ne survit pas à la personne qui l'a
inventé.

**Prix vivant** et **prix bloqué** disent ce qui se passe, dans la langue de
celui qui vend, et ne demandent aucune glose.

---

## Les deux chemins

### Le prix vivant — il suit la maison

Le client est sur le **tarif vivant**. Toute évolution décidée ici — hausse
d'inter-saison, ajustement d'overheads en cours de saison — s'applique à lui dès
sa commande suivante.

- Aucun engagement de volume de sa part.
- Aucune garantie de prix de la nôtre.
- **Il assume l'overhead.**

C'est le comportement actuel de la plateforme, et il reste le **défaut**. Le
nommer ne change rien à son fonctionnement ; ça permet seulement de dire ce
qu'il est quand l'autre existera à côté.

### Le prix bloqué — le volume achète la stabilité

Le client **bloque un volume sur une durée déterminée**. En échange, son prix
d'entrée est figé pour toute la durée : les hausses de tarif de liste ne
l'atteignent pas.

- Engagement de volume de sa part.
- Prix d'entrée garanti de la nôtre.
- **Le volume absorbe l'overhead.**

C'est le contrat brasseur, et c'est un objet nouveau dans le modèle : ni une
mercuriale (qui est un prix négocié mais **sans** engagement de volume ni terme
garanti), ni un panier récurrent (qui dit _quoi_ commander, jamais _combien ça
coûte_ — cf. la décision du 2026-08-17 sur les gabarits).

---

## Ce que ça change dans la résolution de prix

**Le prix bloqué agit à l'ENTRÉE du pipeline, pas comme un étage de plus.**

C'est le point qui décide de tout le reste. Un engagement ne remise pas : il
**remplace le prix canonique** par celui qui a été arrêté à la signature, et
laisse le reste de la chaîne se dérouler normalement.

```
Vivant  :  prix canonique DU JOUR    → mercuriale → volume → promo → geste → plancher
Bloqué  :  prix canonique DU CONTRAT → mercuriale → volume → promo → geste → plancher
                        ▲
                        └── figé à la signature, insensible aux hausses de liste
```

Deux conséquences qu'il faut assumer avant d'écrire une ligne :

**Les promotions restent activables sur le chemin bloqué.** C'est explicitement
voulu : un client engagé n'est pas exclu des opérations commerciales. Mais comme
sa base est plus ancienne — donc, en régime d'inflation, **plus basse** — une
même promotion lui donne un prix mécaniquement inférieur à celui d'un client au
prix vivant. C'est l'objet de l'indicateur ci-dessous.

**Le plancher, lui, reste calculé sur le canonique du contrat.** Un plancher
exprimé en fraction (« jamais sous 50 % du tarif ») suivrait sinon le tarif de
liste et remonterait sous un prix contractuel figé — ce qui reviendrait à
reprendre d'une main la garantie donnée de l'autre.

---

## L'indicateur qui décide d'activer une promo

La question opérationnelle est : **« est-ce que j'active cette promo pour les
clients au prix bloqué ? »**

Elle ne se répond pas au feeling, parce que les deux populations ne partent pas
du même prix. Il faut donc, par article et par promotion candidate, montrer
**trois nombres et un écart** :

| Ce qu'on montre             | Ce que ça dit                                      |
| --------------------------- | -------------------------------------------------- |
| Prix vivant **après** promo | ce que paie un client au tarif du jour             |
| Prix bloqué **après** promo | ce que paierait un client engagé                   |
| **Écart** bloqué vs vivant  | de combien l'engagement est déjà en dessous        |
| Écart **sans** la promo     | ce que l'engagement valait déjà, avant d'y toucher |

La lecture attendue, et la seule qui compte :

> Si le client au prix bloqué est **déjà** sous le prix vivant promotionné, la
> promo ne lui est pas nécessaire — elle offrirait une remise à quelqu'un qui a
> déjà obtenu sa remise en s'engageant. L'activer reviendrait à le payer deux
> fois pour le même engagement.

À l'inverse, si l'inflation a été faible depuis la signature, l'écart est mince
et la promo garde son sens sur les deux chemins.

**Ce dont cet indicateur a besoin et qui existe déjà** : la fonction pure de
résolution, appelable avec deux bases différentes sans rien dupliquer. C'est
précisément ce que `resolvePrice(canonicalCents, …)` permet — il suffit de
l'appeler deux fois.

---

## Ce qu'il faudra trancher avant de coder

Ces questions sont **ouvertes**. Les noter empêche de les décider par accident,
au détour d'une implémentation.

**Que se passe-t-il quand le volume engagé n'est pas atteint ?** Trois réponses
possibles, très différentes : rien (le contrat est une garantie unilatérale), une
régularisation au prix vivant sur l'écart, ou la perte du prix figé pour les
commandes suivantes. Le contrat brasseur réel choisit en général la deuxième —
et c'est aussi la plus lourde à implémenter, parce qu'elle rouvre des commandes
closes. _Voir plus bas : c'est le vrai piège du modèle._

**Le volume engagé se mesure sur quoi ?** Un total en unités toutes références
confondues, ou un engagement par référence ? Un hôtel qui promet « 300
viennoiseries par jour » ne promet pas 300 croissants.

**Que devient un contrat en cours quand le client veut le renégocier ?** Un
avenant qui remplace, ou un second contrat qui se superpose ? Le modèle de
commande a déjà tranché « fait clos + avenant » — la cohérence pousse vers
l'avenant.

**Un contrat peut-il couvrir une partie du catalogue seulement ?** Presque
certainement oui (« la viennoiserie oui, la pâtisserie non »), ce qui en fait un
objet **scopé** — et la portée est déjà un vocabulaire du contexte prix.

---

## Le piège à ne pas reproduire

Le plancher dynamique, livré ce matin, a failli introduire un prix qui **dépend
de l'historique** — donc un prix qu'on ne peut plus expliquer dès que
l'historique bouge. Il n'est acceptable que parce que la décision est **figée
sur la ligne** au moment où elle a compté.

Le prix bloqué présente exactement le même danger, en plus gros : si la
régularisation « volume non atteint » recalcule le prix de commandes déjà
facturées, alors **une commande close cesse d'être close**. Le modèle entier
repose sur le contraire.

La direction à privilégier, si la régularisation est retenue : ne jamais toucher
aux commandes passées, et émettre un **document de régularisation distinct** à
l'échéance du contrat. C'est plus de travail, et c'est la seule forme qui laisse
une facture relisible six mois plus tard.

---

## Ce que ce document ne dit pas

Il ne propose **aucun schéma de table**, volontairement. Le premier réflexe
serait d'ajouter un `contract_type` sur `Company` — et ce serait faux : un même
client peut être sous contrat sur une famille et au tarif du jour sur une autre,
et un contrat a une durée qu'un champ sur la société ne saurait pas porter.

L'objet à modéliser est **l'engagement**, pas le client.
