# Frapper la RUM — plan de la tranche

**Écrit le 2026-09-12.** Objectif : passer de « une fiche marquée EXEMPLE que
personne ne peut signer » à « un mandat nominatif qu'un client signe, qu'on
récupère scanné, et qui devient actif ».

## 0. Ce que cette tranche NE fait pas

- **Pas de coffre à IBAN.** C'est le point de séquencement : le mandat EPC fait
  écrire son IBAN **au débiteur, à la main, dans la zone 5**. Nous n'avons donc
  pas besoin de le détenir pour produire, envoyer et faire signer un mandat.
  Détenir l'IBAN ne sert qu'à **émettre le lot**, qui est une autre tranche et
  reste bloquée par deux objections.
- **Pas de prélèvement.** Aucun euro ne part au terme de cette tranche.
- **Pas de reprise du portefeuille Stripe.** Il n'y a aucun mandat en base.

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

## 6. Ce que je n'ai pas vérifié

- L'état de `payment_mandates` en production.
- Si `AttachMandateProofHandler` et `findCurrent` supportent deux `origin`
  coexistants — le document d'origine signale que `findCurrent` rend « l'actif,
  sinon le dernier », donc collerait un scan sur le mauvais mandat. Sans mandat
  Stripe en base, le cas est théorique, mais le code ne le dit pas.
