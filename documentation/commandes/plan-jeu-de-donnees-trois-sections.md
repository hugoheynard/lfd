# Plan — le jeu de données en trois sections

> **Doc-first, 2026-10-25.** Rien n'est bâti. Demande de Hugo : « pour éviter
> les erreurs on devrait faire un secondary menu avec un jeu utilisateurs, 2
> flow d’exploitation » ; confirmé le même jour : trois sections, Q1–Q3 tranchées (§5).
> L'état actuel est décrit dans
> [`architecture-jeu-de-donnees-par-etapes.md`](architecture-jeu-de-donnees-par-etapes.md).

## 1. Pourquoi

La page `/dev` (`apps/lfd-backoffice-frontend/src/app/dev/seed-page/`, 277
lignes de gabarit, lues le 2026-10-25) empile dans un seul écran :

- la journée de démo, six étapes linéaires (0 commandes passées → 5 tournées
  chargées), qui mêlent retrait et livraison ;
- « Repartir de zéro » (la remise du scénario) ;
- « Tout recharger » (le semis complet, qui supprime aussi les décisions
  tarifaires).

Trois défauts, relevés le 2026-10-25 :

1. **On ne sait pas qui jouer.** Le scénario pose des clients et une équipe,
   mais la page ne dit pas sous quel compte ouvrir le comptoir, le colisage,
   la supervision ou « Ma tournée ».
2. **Le scénario s'arrête au chargement.** Aucun geste d'après l'arrêt n'est
   jouable : manque de produit et sa décision, retrait après inscription,
   lettre au client, révision de quantités, envoi en boutique, relances,
   remise au comptoir, départ et livraison. On les rejoue à la main, et c'est
   là que naissent les erreurs (une commande sans créneau, une remise qui
   échoue).
3. **Deux gestes destructeurs côte à côte**, de portées différentes.

## 2. La forme

Un menu secondaire sous « Jeu de données », trois entrées, une route chacune :

| Entrée             | Route               | Contenu                                                                     |
| ------------------ | ------------------- | --------------------------------------------------------------------------- |
| **Utilisateurs**   | `/dev/utilisateurs` | les comptes du semis, par rôle, et ce que chacun ouvre ; « Tout recharger » |
| **Flux retrait**   | `/dev/retrait`      | la journée vue du comptoir : ses étapes et ses gestes d'après l'arrêt       |
| **Flux livraison** | `/dev/livraison`    | la journée vue des tournées : ses étapes et ses gestes d'après l'arrêt      |

`/dev` redirige vers `/dev/retrait`. La remise à l'état de base reste **une**,
commune aux deux flux (§3), affichée en pied de chacun.

### 2.1 Utilisateurs

Lecture seule, plus « Tout recharger » (déménagé ici : il touche à
l'annuaire, aux sociétés et aux tarifs, pas à la journée).

- **L'équipe** : chaque membre semé, son rôle, les écrans qu'il ouvre
  (« Superviseur — Supervision, Colisage, décision de manque »). Lu de
  l'annuaire et des droits, jamais écrit en dur.
- **Les clients** : la société de référence, ses sites et leurs modes ; les
  pros livrés ; les particuliers. Pour chacun, l'adresse de connexion à la
  boutique.
- **Aucun « se connecter en tant que ».** Une usurpation d'identité, même en
  dev, est une frontière de sécurité : hors de ce plan (voir §5, Q1).

### 2.2 Les deux flux

Un **tronc commun** — commandes passées, plan arrêté, production — puis deux
branches. La production est en forme de **jour** : on ne peut pas arrêter le
plan du retrait sans celui de la livraison. Chaque page montre donc le tronc
(son état, un seul bouton qui le joue), puis ses propres étapes.

**Retrait**

| #   | Étape                                     | Écran pour le voir |
| --- | ----------------------------------------- | ------------------ |
| T   | Commandes passées, plan arrêté, four      | Prod manager       |
| R1  | Sacs faits, dont un **manque déclaré**    | Colisage           |
| R2  | Manque **décidé** par un superviseur      | Supervision        |
| R3  | Transfert du Village **reçu**             | Retrait boutique   |
| R4  | Une commande **remise** au comptoir       | Retrait boutique   |
| R5  | Un client **en retard** (rappel possible) | Supervision        |

**Livraison**

| #   | Étape                                           | Écran pour le voir |
| --- | ----------------------------------------------- | ------------------ |
| T   | Commandes passées, plan arrêté, four            | Prod manager       |
| L1  | Tournées composées                              | Tour manager       |
| L2  | Bacs faits, dont un **départ incomplet** décidé | Colisage           |
| L3  | Tournées chargées                               | Tour manager       |
| L4  | Votre tournée **partie**                        | Ma tournée         |
| L5  | Un arrêt **livré**, un arrêt **en échec**       | Ma tournée         |

Chaque étape se joue **par les vrais handlers**, comme aujourd'hui
(`dev/` a les droits de la racine pour ça), et l'étape atteinte se déduit de
la base. Les étapes actuelles 2 à 5 deviennent T, L1, L2/R1, L3.

### 2.3 Le menu

Le rail garde **une** entrée « Jeu de données ». Le menu secondaire est le
même composant que les autres pages qui en portent un (à repérer au bâti
dans fold : ne pas en dessiner un). Ajout aux deux arbres (rail et tuiles),
cf. `apps/lfd-backoffice-frontend/CLAUDE.md`.

## 3. La remise

Inchangée dans son principe : elle supprime ce que le scénario a créé, puis
repasse les commandes. Elle couvre désormais tout ce que les gestes R/L
écrivent ; la vérification schéma ↔ purge (`dev-scenario-purge-coverage`,
2026-10-25) l'impose à chaque table neuve.

⚠️ `invoices.seed.ts` existe : si un geste du flux facture une commande du
scénario, `card_invoice_outcome` bloquera la remise (exemptée volontairement).
Aucune étape de ce plan ne facture.

## 4. Lots

1. **D1** — routes et menu, sections vides sauf Retrait qui reprend la page
   actuelle ; « Tout recharger » passe dans Utilisateurs.
2. **D2** — Utilisateurs : lecture de l'équipe et des clients (`GET
/admin/dev/accounts`).
3. **D3** — le tronc et le flux livraison (L1–L3 existent ; L2 gagne le
   départ incomplet ; L4, L5 neufs).
4. **D4** — le flux retrait (R1–R5).

## 5. Décisions de Hugo (2026-10-25)

- **Q1 — montrer seulement.** Utilisateurs dit qui est qui et ce que chacun
  ouvre ; aucun « se connecter en tant que ».
- **Q2 — un bouton par flux** joue le tronc commun ; pas de section à part.
- **Q3 — des cases à cocher** avant de jouer : « inclure un manque », « un
  client en retard », « un arrêt en échec ». Décochées, les étapes R/L se
  jouent sans le cas d'erreur.
