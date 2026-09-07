# L'évaluation d'une alerte lit « maintenant », pas « à la commande »

**Ouvert le 2026-09-07**, en préparant la promotion de `dev` vers `main`.
Constaté, pas supposé : la suite `account-alerts.e2e-spec.ts` est passée au
rouge dans une passe complète, et verte trois fois sur trois en isolation.

---

## Le fait

[`evaluate-order-alerts.service.ts`](../../apps/lfd-api/src/b2b/alerts/application/handlers/evaluate-order-alerts.service.ts)
demande son historique ainsi :

```ts
const { drafts, rules } = await this.basket.evaluate({
  companyId,
  lines: order.lines,
  excludeOrderId: order.id,
  now,
});
```

`excludeOrderId` dit **« toutes les autres commandes »**. Ce n'est pas
**« celles d'avant »**. Or l'évaluation n'est pas attendue par la requête HTTP :
elle part sur le bus, et rien ne garantit qu'elle s'achève avant que la commande
suivante n'entre.

Deux commandes rapprochées suffisent donc à ceci :

1. la commande 1 est passée, son évaluation est mise en file ;
2. la commande 2 est passée avant que cette évaluation ne tourne ;
3. l'évaluation de la commande 1 démarre, voit **deux** commandes, et ne se
   croit donc plus la première ;
4. elle signale son propre produit — `VIE-001` — comme « jamais commandé ».

L'alerte est fausse, et elle est fausse **sur la commande la plus ancienne**.

## Ce que ça coûte, et pourquoi ce n'est pas urgent

C'est un **avertissement au staff**, pas un montant ni un droit d'accès : rien
ne se facture, rien ne s'ouvre. Le staff lit « produit jamais commandé » sur un
produit déjà commandé — un bruit, pas une perte.

C'est aussi une course **ancienne**, sans rapport avec le chantier du bon de
commande. La corriger dans la même promotion aurait mélangé un changement de
comportement à un déploiement de 175 commits, et rendu le retour arrière moins
lisible. Décision prise le 2026-09-07 : on déploie, on corrige ensuite.

## Le correctif, quand on le prendra

Faire lire à l'évaluation l'historique **tel qu'il était à la commande**, et non
tel qu'il est à l'évaluation. Concrètement, remplacer `excludeOrderId` par une
borne temporelle — les commandes **antérieures** à celle qu'on évalue — en
gardant l'exclusion pour départager deux commandes du même instant.

⚠️ `EvaluateBasket` est **partagée** avec le contrôle de panier, où il n'y a pas
de commande et où la borne est donc « maintenant ». Le paramètre doit couvrir
les deux cas, sans qu'un appelant ait à connaître l'autre.

## Ce que le test tient en attendant

`account-alerts.e2e-spec.ts` assert désormais la **présence** de `VIE-002` dans
les constats, plus sa position. Il tient ce dont il est le sujet — un produit
inédit parle — sans prétendre tenir un ordre que le système ne garantit pas.

Le jour du correctif, ce test redevient assertable sur le contenu **exact** des
constats : c'est ce qui prouvera que la course est fermée.
