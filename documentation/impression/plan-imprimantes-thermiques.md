# Les imprimantes thermiques — plan

> Hugo, 2026-10-04 : « un système de websocket pour mes imprimantes thermiques,
> deux besoins, prod et colisage : à la clôture d'un container avec son
> contenu, faire imprimer l'étiquette » ; « sans ordi, qu'elle soit connectée
> à la socket ». Imprimantes **pas encore achetées**. État : **doc-first**.
> `vitruve` d'office : une nouvelle entrée publique (frontière de sécurité).

## 1. Ce qui existe (relu le 2026-10-04)

- L'étiquette d'un bac est une page A4 imprimée par le navigateur
  (`livraison/bin-label/bin-label.ts`, `window.print()`). Son JSDoc garde la
  question ouverte : « Q22 — imprimante d'étiquettes ou planche A4 adhésive ».
  Elle porte la tournée et le rang en très gros, la référence, le type de bac
  et la moitié, « partagé avec … », le code court et le QR.
- Un bac naît quand le coliseur le **déclare** (`delivery.delivery_bin`), pas
  quand on l'imprime : imprimer est une lecture.
- La passerelle (`gateway/`) est le **seul** chemin public vers l'API ; l'API
  a un Durable Object (`Backend`) et dort après une heure d'inactivité.
- La boîte d'envoi (`journalisation/plan-boite-d-envoi.md`, BE1 en cours)
  donne la publication durable, l'état par abonné et le rejeu.

## 2. Le matériel : une Zebra Link-OS en Weblink

Une Brother réseau n'ouvre aucune connexion vers un serveur à nous : elle
attend qu'on lui envoie un travail. Une **Zebra Link-OS** (ZD421, ZD621 ; pas
ZD220/ZD230/ZT111) le fait par sa fonction **Weblink** : elle ouvre elle-même
une WebSocket TLS sortante vers l'URL qu'on lui configure, et y reçoit du ZPL.
Pas d'ordinateur, pas de port ouvert au fournil.

Relevé le 2026-10-04, sources dans la conversation et ici :

- pas de certificat « signé par Zebra » : on charge sur l'imprimante la racine
  de l'autorité qui signe le certificat servi (`WEBLINK1_CA.NRD`) ; figer
  l'autorité chez Cloudflare (Advanced Certificate Manager) ; NTP réglé ;
- authentification de l'imprimante par HTTP Basic à l'ouverture ;
- ping/pong toutes les ~60 s, trames binaires, plusieurs canaux (principal,
  configuration, données brutes), chacun une WebSocket.

**Risque non levé** : la poignée de main TLS (suites de chiffrement, SNI)
entre le firmware et le bord Cloudflare. Aucun retour derrière Cloudflare.
→ **Lot IM0 avant tout achat en nombre.**

## 3. L'architecture

```mermaid
sequenceDiagram
  participant P as Coliseur
  participant API as API (container)
  participant O as Boîte d'envoi
  participant I as Imprimerie (Durable Object)
  participant Z as Zebra (Weblink)
  Z->>I: WebSocket sortante, TLS + Basic
  P->>API: clôt le contenant
  API->>O: print.requested (même transaction)
  O->>I: livre l'ordre (ZPL déjà rendu)
  I->>Z: trame binaire ZPL
  Z-->>I: état (~HS) : imprimé / papier / capot
  I-->>O: accusé → livré, ou erreur → rejeu
```

- **L'Imprimerie** : un Durable Object **par imprimante**, qui tient sa
  connexion (API d'hibernation : il dort sans la couper). L'API ne tient
  aucune socket : elle dort, elle.
- **Entrée publique** : une route dédiée de la **passerelle**
  (`/printers/connect`), qui authentifie l'imprimante et transmet la
  WebSocket à son Durable Object. Aucune autre route n'y mène ; l'imprimante
  ne peut rien appeler d'autre.
- **L'ordre d'impression est un fait durable** (`print.requested`), écrit dans
  la transaction du geste qui le déclenche. Son abonné livre à l'Imprimerie.
  Imprimante hors ligne : l'ordre attend et part à la reconnexion ; au-delà de
  dix essais, il est mort, visible et rejouable.
- **Le gabarit est rendu en ZPL côté serveur.** L'imprimante ne fait que
  recevoir. Changer une étiquette ne touche ni l'imprimante, ni l'Imprimerie.
- **Accusé** : après l'envoi, l'Imprimerie demande l'état (`~HS`) ; papier
  vide ou capot ouvert = erreur nommée, que la carte de santé et le poste
  affichent (« plus d'étiquettes au poste colisage »).
- **Réimprimer** crée un nouvel ordre (une lecture, comme aujourd'hui).

## 4. Les données

- `printers` (configuration, pas d'agrégat) : nom, rôle (`packing`,
  `production`), identifiant Basic (secret haché, jamais en clair), largeur
  d'étiquette, actif. Réglé à l'écran par un droit neuf ; une migration
  ajoute la ressource, **jamais** le droit d'un rôle.
- Aucune table d'ordres : c'est la boîte d'envoi.
- Le secret d'une imprimante se saisit à l'écran et se tape sur l'imprimante
  (utilitaire Zebra) ; il ne passe jamais par une ligne de commande.

## 5. Questions pour Hugo

- **Q1 — Production : quoi, et quand ?** Une étiquette par fournée, par
  chariot, par feuille d'atelier ? Au geste « sorti du four », à la clôture ?
- **Q2 — Colisage : une étiquette par bac** (contenu, tournée, rang, code,
  QR), comme l'A4 actuelle, à la **déclaration** du bac ? Ou par commande ?
- **Q3 — Format** : largeur et hauteur d'étiquette (ex. 100 × 150 mm).
- **Q4** : une imprimante par poste, ou une partagée ?

## 6. Lots

| Lot | Contenu                                                                                              | Migration |
| --- | ---------------------------------------------------------------------------------------------------- | --------- |
| IM0 | **Essai** : une Zebra, un Worker de test, la racine chargée ; on lit son journal. Décide de l'achat. | non       |
| IM1 | Route de la passerelle, Imprimerie (Durable Object), table `printers`, écran de réglage              | additive  |
| IM2 | `print.requested` sur la boîte d'envoi, rendu ZPL, accusé `~HS`                                      | non       |
| IM3 | Étiquette de bac à la déclaration (Q2) ; « réimprimer »                                              | non       |
| IM4 | Étiquettes de production (Q1)                                                                        | non       |

IM1 attend BE1 (la boîte d'envoi) et le verdict d'IM0.

## 7. Contradiction de `vitruve` (2026-10-04), et la v2

**BLOQUANTS, levés :**

1. **À qui appartient l'Imprimerie ?** La passerelle ne contient pas de
   métier : elle n'a que du routage. L'API n'a qu'une classe de Durable
   Object, le container lui-même, et une migration de classe est presque
   irréversible. → L'Imprimerie devient **un Worker à part,
   `apps/lfd-printing`**, avec sa classe `Printer` (un Durable Object par
   imprimante). La passerelle y est reliée par un service binding, comme
   pour `ROUTE_PLANNER`. Elle entre dans la matrice des frontières :
   personne ne l'importe, elle ne lit aucune base.
2. **La passerelle ne peut pas vérifier un secret qui vit dans Postgres.** →
   La passerelle ne fait que **router** la WebSocket. C'est le Durable Object
   de l'imprimante qui vérifie l'en-tête Basic, contre un hash qu'il garde
   dans son propre stockage. L'API lui **pousse** ce hash, et l'état
   actif ou archivé, quand on les règle à l'écran. Désactiver une imprimante
   ferme sa socket.
3. **L'abonné, dans le container, n'atteint pas un Durable Object.** → Il
   passe par une **seconde route**, `POST /printers/:id/jobs` de la
   passerelle, protégée par un jeton de service, sur le même modèle que
   `ROUTE_PLANNER_TOKEN`. Le jeton est rangé avec les autres clés
   d'exécution. La phrase « aucune autre route n'y mène » du §3 est fausse :
   il y en a deux, et chacune a sa propre authentification.
4. **Une étiquette imprimée à la déclaration ne connaît pas toujours la
   tournée ni le rang.** Un bac se déclare aussi hors tournée. → C'est la
   question Q2, reformulée au §5 bis.
5. **L'état `~HS` ne dit pas quel ordre a échoué.** → Le Durable Object
   **sérialise** : un seul ordre en vol à la fois, et le suivant attend
   l'état. L'accusé veut dire « remis sans erreur détectée », pas
   « imprimé ». Un rejeu peut donc produire une **étiquette en double**,
   et c'est assumé : elle porte le même code et le même QR, donc elle ne
   trompe personne.

**SÉRIEUX, tranchés :**

- **Imprimante hors ligne.** L'abonné « impression » a sa propre politique de
  rejeu : « imprimante absente » ne compte pas comme un essai. On réessaie
  toutes les 5 minutes pendant 24 heures, et au-delà le message est mort. Une
  nuit d'imprimante éteinte ne tue plus ses ordres. La boîte d'envoi doit donc
  permettre une politique par abonné ; c'est à ajouter en IM2.
- **Le ping de Weblink** peut réveiller le Durable Object à chaque passage :
  à mesurer dans IM0, avec la réponse automatique de l'API d'hibernation.
- **Force brute** : une limite de débit sur la route `connect` de la
  passerelle, et un verrouillage après N échecs dans le Durable Object.
- **Le ZPL est rendu au moment de publier.** Changer la largeur d'étiquette
  ne touche pas les ordres déjà en attente. C'est assumé.
- Tant que l'admin n'a pas accordé le droit neuf à l'écran, personne ne
  règle une imprimante.
- IM1 porte **deux** migrations : Prisma (`printers`) et la classe de Durable
  Object du nouveau Worker.

### 5 bis. Q2 reformulée — quand imprimer l'étiquette d'un bac ?

- **a.** À la déclaration, sans tournée ni rang (le bac n'en a pas toujours).
- **b.** Quand la tournée est figée, avec la tournée et le rang en gros :
  c'est un autre fait durable (`delivery.round_locked`).
- **c.** Les deux : une petite étiquette d'identité à la déclaration, puis
  une étiquette de tournée au verrouillage.
