# Frapper la RUM — plan de la tranche

**Écrit le 2026-09-12.** Objectif : passer de « une fiche marquée EXEMPLE que
personne ne peut signer » à « un mandat nominatif qu'un client signe, qu'on
récupère scanné, et qui devient actif ».

## 0. 🔴 Ce que cette tranche fait — révisé le 2026-09-12

La première version disait « pas de coffre à IBAN », au motif que le mandat EPC
fait écrire son IBAN **au débiteur, à la main, dans la zone 5**. La prémisse est
exacte ; la conclusion ne l'était qu'à moitié, et la contradiction l'a montré :
dès le dépôt du scan, **le papier portant cet IBAN manuscrit entre chez nous**,
sous une clé prévisible, sans chiffrement, et `DocumentStore` n'a pas de
`delete`. Ce qui était repoussé, c'était la ressaisie — pas la détention.

La décision du 2026-09-12 tranche dans l'autre sens : **le RIB du client se
saisit**, sur sa fiche, aux mêmes règles que le compte créancier. La tranche
porte donc **le coffre**, et ce n'est plus une option à séquencer.

Ce qu'elle ne fait toujours pas : **aucun euro ne part**. Émettre le lot reste
une autre tranche, bloquée par deux objections ouvertes.

## 1. Le préalable, et il n'est pas technique

🔴 **Vérifier que `payment_mandates` est vide en PRODUCTION.** Tout le plan en
dépend : l'objection qui bloque cette tranche tient à un `creditor_id` nullable,
et il ne devait être nullable que pour les mandats Stripe. Table vide ⇒ `NOT
NULL` sans reprise, et l'objection tombe. Table non vide ⇒ le plan change.

C'est une lecture, pas une écriture — mais elle touche la production, donc c'est
Hugo qui la fait, et le secret ne traverse pas une ligne de commande.

## 2. Le modèle — ce qui change sur `payment_mandates`

| Colonne                                   | Geste                                             | Pourquoi                                                                                  |
| ----------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `stripe_customer_id`, `payment_method_id` | deviennent **nullables**                          | un mandat que nous émettons n'en a aucun ; aujourd'hui la table ne peut pas le stocker    |
| `origin`                                  | **ajoutée**, `stripe \| direct`, défaut `direct`  | discriminant ; le moteur de lot ne lira que `direct`                                      |
| `creditor_id`                             | **ajoutée**, `NOT NULL`, FK vers `legal_entities` | quelle entité encaisse — sous quel ICS le mandat est signé                                |
| `reference`                               | inchangée — elle **est** la RUM                   | deux fronts la lisent ; un renommage coûte trois déploiements pour un gain de vocabulaire |
| `UNIQUE (creditor_id, reference)`         | **ajoutée**                                       | une RUM unique chez un créancier                                                          |
| statut `awaiting_signature`               | **ajoutée** à l'enum                              | l'état entre la frappe et le dépôt de la preuve                                           |

⚠️ L'enum gagne une valeur : les deux fronts lisent un `Record` exhaustif des
statuts et devront être redéployés. C'est une contrainte d'ordonnancement, pas
un risque — mais elle doit être dite.

## 3. Le domaine

- `Rum` existe déjà, complet et testé. **Une seule chose y change** : d'où
  viennent ses caractères — voir le §3 bis.
- L'agrégat `PaymentMandate` gagne deux gestes :
  - `draftDirect(creditorId, …)` — frappe la RUM, statut `awaiting_signature` ;
  - `activateOnProof(key, at)` — **la seule voie vers `active`**.
- 🔴 **Pas de preuve ⇒ pas d'actif**, et tenu par l'agrégat : il n'y a rien à
  « corriger » aujourd'hui, aucun agrégat ne sait activer un mandat.
- Quand la RUM est frappée, publier le fait qui pose `firstMandateIssuedAt` sur
  l'entité — le verrou du créancier imprimé, déjà écrit et testé, sans appelant.

## 3 bis. La RUM — dans sa propre doc

🔴 **Elle ne se dérive plus de l'identifiant du mandat** (décidé le 2026-09-12) :
`LFC` + **23** caractères du `SecretGenerator`, **26 au total**, 115 bits, sans
composante temporelle.

⚠️ **26, et pas 29** : le peigne de la référence sur le formulaire fait
**vingt-six cases**, et `comb` tronque silencieusement au-delà. Une RUM plus
longue sortirait coupée sur le papier signé pendant que la base en stocke
l'intégralité. La borne utile n'est donc pas celle de l'EPC.

Le raisonnement complet, les contraintes EPC, le refus de l'UUID et ce que la
bascule fait perdre : [`rum.md`](rum.md).

**Dans cette tranche**, ça tient en deux gestes : remplacer `forMandate` par une
frappe aléatoire, et réécrire le JSDoc qui défend l'ancienne — dans le **même
commit**, sans quoi il défendra un mécanisme disparu.

## 3 ter. 🔴 Un nouveau RIB n'est PAS un nouveau mandat — décidé le 2026-09-12

La règle d'abord envisagée était « nouveau RIB ⇒ nouveau mandat ⇒ nouvelle
RUM ». Elle est plus stricte que la norme, et l'arbitrage est allé à la norme :
le SEPA prévoit l'**amendement**. Le mandat survit, **sa RUM ne bouge pas**, et
c'est le prélèvement suivant qui porte le changement.

### Ce que ça achète, et ce que ça coûte

**Achète** : le client ne resigne pas pour un simple changement de banque. Sur un
portefeuille repris, c'est la différence entre une formalité et une campagne de
signatures.

**Coûte** : le mandat cesse d'être un objet immuable. Il gagne un état de
transition — « un amendement attend d'être annoncé » — et cet état se **consomme
une seule fois**, au premier prélèvement qui le porte. Un état consommable est
exactement le genre de chose qui se rejoue deux fois ou jamais.

### Ce que ça impose au modèle

- la RUM reste **immuable** — ce qui tombe bien, c'est déjà sa règle ;
- le mandat garde **le compte précédent** en plus du nouveau, donc **deux** IBAN
  chiffrés au coffre tant que l'amendement n'est pas annoncé ;
- un **drapeau consommable** : le prochain lot le lit, l'annonce, puis l'éteint.
  Il ne s'éteint pas à la saisie du nouveau RIB — il s'éteint quand la banque a
  vu le changement ;
- un changement de **nom du débiteur** est un amendement aussi, et il n'a pas la
  même forme que le changement de compte.

⚠️ **Tout ce qui précède sur la mécanique de l'amendement vient de la norme telle
que je la connais, pas d'un guide en main** — les champs exacts, le cas du
changement de banque par rapport au changement de compte dans la même banque, et
ce que la Caisse d'Épargne exige au juste. C'est une **question de plus à leur
poser**, et elle conditionne du code. Rien ici ne doit être codé sur cette
section seule.

## 3 quater. Le coffre — ce qu'il faut, et ce qui n'existe pas

- **Aucun chiffrement au champ dans le dépôt.** `platform/secret/` est un
  générateur de jetons, pas un coffre _(vérifié le 2026-09-12)_.
- `keyVersion` stocké **à côté du chiffré, dès la première ligne** : sans lui la
  rotation est impossible, et il ne se rétro-ajoute pas.
- L'IBAN du débiteur traverse **HTTP → Zod → handler**, contrairement à celui du
  créancier qui n'a qu'un lecteur. Il doit donc être exclu des journaux
  explicitement — le payload de la commande n'est jamais journalisé tel quel.
- Validation **mod-97** dans le value object `Iban`, qui existe déjà et se
  réutilise tel quel — c'est la même règle de forme pour les deux comptes.
- `DocumentStore` doit gagner un **`delete`**, sinon la promesse de purge est une
  phrase. Il n'en a pas _(vérifié le 2026-09-12)_.

🔴 **La promesse tenable, et c'est celle-ci et pas une autre** : l'IBAN du
débiteur n'est **jamais rendu par une API de lecture, ni rehydraté dans un
agrégat**. Un mapper la tient. Tout le reste demande des gestes, listés ci-dessus
pour qu'aucun ne soit découvert en route.

## 4. Le document

Le même `renderSepaMandatePdf`, avec un bloc débiteur et la RUM imprimée. **Pas
un second moteur** : une fonction, deux appelants. La mention « EXEMPLE » ne se
dessine que sur la fiche vierge.

## 5. L'ordre

1. le préalable du §1 ;
2. la RUM tirée du `SecretGenerator` (§3 bis) — isolée, testable seule, et sans
   dépendance au reste ;
3. la migration additive + `origin`/`creditor_id` ;
4. l'agrégat et ses deux gestes, avec leurs tests ;
5. le PDF nominatif ;
6. l'envoi au client (le mailer sait déjà joindre un PDF) ;
7. le dépôt du scan ⇒ `active`.

## 6. 🔴 Les six objections bloquantes de la contradiction

Rendues le 2026-09-12, **avant** toute ligne de code. Deux ont été vérifiées à la
main et sont refermées ; les quatre autres ne le sont pas.

| #   | Objection                                                                                                            | État                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | **La RUM ne rentre pas dans sa case** : le peigne du formulaire fait 26 cases, `comb` tronque au-delà **en silence** | ✅ refermée — la borne est passée à 26 caractères                                       |
| 2   | L'identifiant du mandat est un `cuid()` donné par la base, pas un ULID : la frappe décrite était impossible          | ✅ dissoute — la RUM ne dérive plus de l'id                                             |
| 3   | `creditor_id NOT NULL` casse une route en service, et le défaut `direct` étiquette les mandats Stripe comme directs  | ✅ **la route est supprimée** depuis                                                    |
| 4   | L'index partiel « un seul actif par société » n'est pas touché, alors que le plan s'appuie sur son extension         | ❌ **ouverte**                                                                          |
| 5   | Le dépôt du scan vise `findCurrent`, donc l'**ancien** mandat lors d'un remplacement — pas un cas théorique          | ❌ **ouverte**                                                                          |
| 6   | « Pas de preuve ⇒ pas d'actif » n'est tenu par rien : la passerelle Stripe rendait déjà `active`                     | 🟡 sans objet depuis la suppression de la route, **à re-tenir** dans le parcours direct |

⚠️ **L'objection 5 mord d'autant plus avec l'amendement** : un mandat amendé
reste le mandat courant, donc `findCurrent` rend le bon — mais le jour où un
vrai remplacement arrive (résiliation puis nouveau mandat), le scan se collerait
encore sur l'ancien. Le dépôt doit viser un mandat **par son identifiant**.

## 7. Ce que je n'ai pas vérifié

- L'état de `payment_mandates` en production.
- Si `AttachMandateProofHandler` et `findCurrent` supportent deux `origin`
  coexistants — le document d'origine signale que `findCurrent` rend « l'actif,
  sinon le dernier », donc collerait un scan sur le mauvais mandat. Sans mandat
  Stripe en base, le cas est théorique, mais le code ne le dit pas.
