# Les pièces d'un client dans R2 — ce qu'on range, et où

**Ouvert le 2026-09-07.** Le bucket `customers` existe et sert déjà les bons de
commande. Ce document dit **comment il est organisé**, et ce qui viendra s'y
ajouter — l'écrire avant que le comptable dépose sa première facture coûte une
page ; l'écrire après coûte une migration de fichiers.

---

## 1. Trois buckets, et la ligne qui les sépare

| Bucket      | Ce qu'il contient                              | Sens              | Public ?                |
| ----------- | ---------------------------------------------- | ----------------- | ----------------------- |
| `kbis`      | extrait de greffe, mandat signé                | il **nous donne** | non                     |
| `customers` | bons de commande, feuilles d'atelier, factures | on **lui rend**   | **non**                 |
| `media`     | visuels du catalogue                           | vitrine           | **oui**, par un domaine |

La séparation n'est pas du rangement. La configuration le dit en une phrase :

> « Chaque usage porte son bucket **et ses clés** : un jeton n'ouvre que le
> sien. »

🔴 **Le KBIS reste dehors, bien qu'il appartienne aussi à un client.** Il a son
bucket depuis plus longtemps, avec des données dedans : l'y ranger serait une
migration de fichiers, pas un renommage. La ligne qui reste vraie est celle du
**sens** — `kbis` porte ce que le client nous donne, `customers` ce qu'on lui
rend.

⚠️ **`customers` ne doit jamais être servi par un domaine.** C'est la différence
avec `media`, et elle est structurante : une adresse publique rendrait la facture
d'un client lisible par qui devine une clé. Ces pièces passent par l'API,
derrière le mur de la société.

---

## 2. L'arborescence

```
customers/
├── orders/{orderId}/
│   ├── bon-de-commande-r{revision}.pdf     le client — montants, sans QR
│   ├── fiche-atelier-r{revision}.pdf       le fournil — sans montants
│   └── bon-staff-r{revision}.pdf           le bureau — SKU, trace du prix
│
├── production/{AAAA-MM-JJ}/
│   └── compte-a-produire.pdf               le récapitulatif du jour
│
└── companies/{companyId}/invoices/{AAAA-MM}/
    └── facture-{numero}.pdf                déposée par le comptable
```

### Pourquoi rangé par COMMANDE, et pas par audience

C'est le choix qui surprend, alors il vaut d'être dit : **les trois audiences
d'une même commande vivent côte à côte**, la feuille du fournil à côté du bon du
client.

Ce n'est pas pur, et c'est délibéré. Séparer par audience éparpillerait les
papiers d'une même commande dans deux arborescences, et une règle de rétention
devrait être posée deux fois, à deux endroits qui finiraient par diverger.
**Tout ce qui concerne la commande X est en X.**

**Ce que ça coûte, et pourquoi c'est acceptable** : les mêmes clés ouvrent la
feuille d'atelier. Elle ne porte **aucun montant** — c'est une propriété de son
type, pas une consigne — donc le pire qu'un porteur de ces clés y trouve est ce
qu'il pouvait déjà lire sur le bon. Ce qui protège un client d'un autre n'a
jamais été le bucket : c'est le **préfixe de clé**, dérivé d'identifiants
vérifiés, et le **mur de la société** côté API.

### Pourquoi la révision est dans le nom de fichier

Le port du stockage le dit : « une même clé écrase — c'est ce qui fait qu'un
remplacement reste un remplacement ». Un chemin sans révision ferait donc
disparaître, au premier avenant, le PDF qui circule déjà — **le seul document que
le client peut opposer**.

Chaque révision garde le sien. L'écran propose la dernière ; l'historique reste
lisible.

---

## 3. Ce qui s'y range, pièce par pièce

| Pièce                      | Clé                                           | Qui l'écrit      | Quand                        | État |
| -------------------------- | --------------------------------------------- | ---------------- | ---------------------------- | ---- |
| **Bon de commande** client | `orders/{id}/bon-de-commande-r{n}.pdf`        | l'API            | au 1ᵉʳ téléchargement        | ✅   |
| **Fiche d'atelier**        | `orders/{id}/fiche-atelier-r{n}.pdf`          | l'API            | au tirage du lot             | ⛔   |
| **Bon staff**              | `orders/{id}/bon-staff-r{n}.pdf`              | l'API            | au 1ᵉʳ téléchargement        | ⛔   |
| **Compte à produire**      | `production/{jour}/compte-a-produire.pdf`     | l'API            | à la clôture du plan du soir | ⛔   |
| **Facture**                | `companies/{id}/invoices/{mois}/facture-…pdf` | **le comptable** | au dépôt                     | ⛔   |

### Le bon de commande — le seul livré

Écrit au **premier téléchargement**, pas à la passation : l'immense majorité des
commandes ne verra jamais son PDF demandé.

⚠️ **Ce pari tombe le jour où le courriel de confirmation joint le bon**, ce qui
est l'étape suivante. On passera d'une fraction des commandes à leur totalité —
et c'est ce qui rend la question de la conservation pressante
([`../todos/todo-conservation-des-bons-en-r2.md`](../todos/todo-conservation-des-bons-en-r2.md)).

La course entre deux téléchargements simultanés est **inoffensive**, et pour une
raison qui vaut pour tout ce document : le rendu est **déterministe**. Deux
écritures produisent des octets identiques, la seconde écrase la première par le
même objet, et peu importe qui gagne. Ni verrou, ni réservation.

### La fiche d'atelier — ce que le rangement change

Elle est **tirée à la demande** aujourd'hui, et rien n'en garde de copie. La
ranger répond à une question qu'on ne peut pas poser actuellement : _quelle
feuille est partie au fournil ce matin-là ?_ Après un avenant, deux versions
circulent, et le papier lui-même porte sa révision — mais rien ne permet de
retrouver la première.

### Le compte à produire — la seule pièce qui n'est pas par commande

C'est le récapitulatif d'une **journée** : combien de croissants, combien de
traditions, tous clients confondus. Il n'appartient à aucune commande, d'où son
préfixe à part.

Il se range à la **clôture du plan du soir** — le moment où la journée bascule,
et donc le seul instant où le compte est arrêté. Le tirer plus tard donnerait un
autre nombre.

⚠️ **Il ne porte aucun nom de client.** C'est un compte de matière, pas une
liste de commandes ; le fournil s'en sert pour lancer des fournées, pas pour
préparer des sacs. La feuille par commande, elle, nomme le client — les deux ne
se remplacent pas.

### La facture — la seule que nous n'écrivons pas

C'est la pièce qui change la nature du bucket, et il faut le dire franchement :
**la plateforme n'émet pas de facture**, et
[`order-documents.ts`](../../packages/b2b-ui/src/order/order-documents.ts) la
déclare indisponible pour une raison qui ne bouge pas :

> « Une facture porte un numéro dans une série continue et des mentions légales.
> Aucune numérotation n'existe côté serveur ; en fabriquer une dans le navigateur
> produirait un document sans valeur que quelqu'un finirait par envoyer à son
> comptable. »

Elle sera donc **déposée**, pas générée : le comptable la produit dans son outil
et la verse ici. Trois conséquences, qui ne sont pas les mêmes que pour les
pièces qu'on fabrique :

1. **Elle n'est pas déterministe** — elle ne se refabrique pas. Perdre le fichier
   perd la pièce, ce qui n'est vrai d'aucune autre entrée de ce tableau.
2. **Elle est rangée par SOCIÉTÉ et par MOIS**, pas par commande : une facture
   couvre un relevé, pas un achat.
3. **Elle porte un numéro de série**, qui devra vivre en base — pas seulement
   dans un nom de fichier, qu'on peut renommer.

Le chantier est ailleurs :
[`../b2b/architecture-facturation.md`](../b2b/architecture-facturation.md).

---

## 4. Deux règles qui valent pour tout ce bucket

**La clé ne vient jamais du client.** Elle se dérive d'identifiants déjà
vérifiés — `orderId` après le mur de la commande, `companyId` après le mur de la
société. C'est ce que le port impose, et c'est le mur de tenancy du stockage : il
est **dans le chemin**.

**Ce qui est archivé ne se réécrit pas.** Un avenant ajoute une révision ; il
n'écrase rien. C'est la propriété qui fait qu'un client peut opposer un document,
et c'est aussi celle qui fait croître le stockage sans fin — d'où le TODO de
conservation, dont la réponse sera **comptable avant d'être technique**.

---

## 5. Ce que ce document ne dit pas

- **Combien de temps on garde** :
  [`../todos/todo-conservation-des-bons-en-r2.md`](../todos/todo-conservation-des-bons-en-r2.md).
- **Ce que contient chaque pièce**, audience par audience :
  [`architecture-bon-de-commande.md`](architecture-bon-de-commande.md).
- **Comment une facture est émise** :
  [`../b2b/architecture-facturation.md`](../b2b/architecture-facturation.md).
