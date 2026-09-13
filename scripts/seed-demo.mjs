#!/usr/bin/env node
// Base de démonstration déterministe pour les captures d'écran, les mesures
// de performance et les essais : 3 cahiers, 6 fiches avec formules LaTeX,
// ~80 exercices de tous types, un examen à J+21, 60 jours de journal simulé
// (état FSRS cohérent, rejoué avec ts-fsrs). Produit une sauvegarde Cahiers
// (schéma 4) importable par « Restaurer une sauvegarde » ou par le crochet
// `window.__cahiers.importBackup` utilisé par scripts/screenshots.mjs.
//
//   node scripts/seed-demo.mjs [sortie.json]   (défaut : docs/demo/demo-backup.json)

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmptyCard, fsrs } from 'ts-fsrs'

const DAY = 86_400_000

// ---- Deterministic PRNG (mulberry32) -----------------------------------------
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function dayStart(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// ---- Content -----------------------------------------------------------------

const FICHES = [
  {
    id: 'fiche-electrostatique',
    cahier: 'cahier-physique',
    title: 'Électrostatique',
    content: `## Loi de Coulomb
La force exercée par une charge ponctuelle $q_1$ sur une charge $q_2$ placée à la distance $r$ s'écrit $\\vec{F}_{1\\to 2} = \\dfrac{q_1 q_2}{4\\pi\\varepsilon_0 r^2}\\,\\vec{u}_{1\\to 2}$. Elle est attractive si les charges sont de signes opposés, répulsive sinon. La permittivité du vide vaut $\\varepsilon_0 = 8{,}85\\cdot 10^{-12}\\ \\mathrm{F\\cdot m^{-1}}$.

## Champ électrostatique
Le champ créé par une charge ponctuelle $q$ à la distance $r$ vaut $\\vec{E} = \\dfrac{q}{4\\pi\\varepsilon_0 r^2}\\,\\vec{u}_r$, en volts par mètre. **Principe de superposition** : le champ créé par plusieurs charges est la somme vectorielle des champs créés par chaque charge.

## Théorème de Gauss
Le flux du champ électrostatique à travers une surface fermée est égal à la charge intérieure divisée par $\\varepsilon_0$ :
$$\\oint_{\\Sigma} \\vec{E}\\cdot\\mathrm{d}\\vec{S} = \\dfrac{Q_{int}}{\\varepsilon_0}$$
Il s'applique efficacement aux distributions à haute symétrie : sphère, cylindre infini, plan infini.

## Potentiel électrostatique
Le champ dérive d'un potentiel : $\\vec{E} = -\\overrightarrow{\\mathrm{grad}}\\, V$. Le potentiel d'une charge ponctuelle vaut $V = \\dfrac{q}{4\\pi\\varepsilon_0 r}$ à une constante près. Les surfaces équipotentielles sont orthogonales aux lignes de champ.

## Condensateur plan
Un condensateur plan de surface $S$ et d'épaisseur $e$ a une capacité $C = \\dfrac{\\varepsilon_0 S}{e}$. L'énergie stockée vaut $\\mathcal{E} = \\dfrac{1}{2} C U^2$.

## L'essentiel
- Coulomb en $1/r^2$, Gauss pour les hautes symétries.
- $\\vec{E} = -\\overrightarrow{\\mathrm{grad}}\\, V$ ; équipotentielles ⊥ lignes de champ.
- $C = \\varepsilon_0 S / e$, $\\mathcal{E} = \\tfrac{1}{2} C U^2$.`,
    points: [
      ['definition', 'Loi de Coulomb', '$\\vec{F}_{1\\to 2} = \\dfrac{q_1 q_2}{4\\pi\\varepsilon_0 r^2}\\,\\vec{u}_{1\\to 2}$'],
      ['formule', 'Champ d’une charge ponctuelle', 'Le champ créé par une charge ponctuelle $q$ à la distance $r$ vaut $\\vec{E} = \\dfrac{q}{4\\pi\\varepsilon_0 r^2}\\,\\vec{u}_r$'],
      ['theoreme', 'Théorème de Gauss', 'Le flux du champ électrostatique à travers une surface fermée est égal à la charge intérieure divisée par $\\varepsilon_0$'],
      ['formule', 'Champ et potentiel', 'Le champ dérive d\'un potentiel : $\\vec{E} = -\\overrightarrow{\\mathrm{grad}}\\, V$'],
      ['formule', 'Capacité du condensateur plan', 'a une capacité $C = \\dfrac{\\varepsilon_0 S}{e}$'],
    ],
    exercises: [
      [0, { type: 'flashcard', question: 'Quelle est l’expression de la force de Coulomb exercée par $q_1$ sur $q_2$ à la distance $r$ ?', answer: '$\\vec{F}_{1\\to 2} = \\dfrac{q_1 q_2}{4\\pi\\varepsilon_0 r^2}\\,\\vec{u}_{1\\to 2}$', typed: true }, 2, ['Coulomb', 'formule']],
      [0, { type: 'flashcard', question: 'Dans quel cas la force de Coulomb entre deux charges est-elle attractive ?', answer: 'Quand les charges sont de signes opposés.' }, 1, ['Coulomb']],
      [0, { type: 'mcq', question: 'Comment varie la norme de la force de Coulomb quand la distance double ?', choices: ['Elle est divisée par 4', 'Elle est divisée par 2', 'Elle double', 'Elle est inchangée'], correct: [0], distractorReasons: ['', 'Ce serait une loi en $1/r$.', 'Elle décroît.', 'Elle dépend de $r$.'], explanation: 'Loi en $1/r^2$.' }, 1, ['Coulomb']],
      [1, { type: 'cloze', text: 'Le champ créé par une charge ponctuelle $q$ à la distance $r$ vaut {{$\\vec{E} = \\dfrac{q}{4\\pi\\varepsilon_0 r^2}\\,\\vec{u}_r$}}.' }, 2, ['champ']],
      [1, { type: 'flashcard', question: 'En quelle unité s’exprime le champ électrostatique ?', answer: 'En volts par mètre ($\\mathrm{V\\cdot m^{-1}}$).' }, 1, ['champ']],
      [1, { type: 'cloze', text: 'Le champ créé par plusieurs charges est la {{somme vectorielle}} des champs créés par chaque charge.' }, 1, ['superposition']],
      [2, { type: 'mcq', question: 'À quoi est égal le flux du champ électrostatique à travers une surface fermée ?', choices: ['$Q_{int}\\,\\varepsilon_0$', '$Q_{int}/\\varepsilon_0$', '$\\varepsilon_0/Q_{int}$', '$Q_{int}/\\mu_0$'], correct: [1], distractorReasons: ['Produit au lieu du quotient.', '', 'Quotient inversé.', '$\\mu_0$ est la perméabilité.'], explanation: 'Théorème de Gauss.' }, 1, ['Gauss']],
      [2, { type: 'order', instruction: 'Remets dans l’ordre les étapes d’un calcul de champ par le théorème de Gauss.', items: ['Analyser les symétries et invariances', 'En déduire la direction et les variables du champ', 'Choisir une surface de Gauss adaptée', 'Calculer le flux à travers cette surface', 'Calculer la charge intérieure', 'Appliquer $\\Phi = Q_{int}/\\varepsilon_0$ et conclure'] }, 2, ['Gauss', 'méthode']],
      [2, { type: 'demonstration', title: 'Champ d’une sphère uniformément chargée', statement: 'Établir $\\vec{E}(r)$ pour une sphère de rayon $R$ portant la charge $Q$ répartie en volume, pour $r > R$ puis $r < R$.', steps: [{ text: 'Symétries : $\\vec{E} = E(r)\\,\\vec{u}_r$.', why: 'L’analyse des symétries fixe la forme du champ.' }, { text: 'Surface de Gauss : sphère de rayon $r$ centrée.', why: 'Le champ y est normal et de norme constante.' }, { text: 'Flux : $\\Phi = 4\\pi r^2 E(r)$.' }, { text: 'Pour $r > R$ : $E = \\dfrac{Q}{4\\pi\\varepsilon_0 r^2}$.', why: 'Toute la charge est intérieure.' }, { text: 'Pour $r < R$ : $E = \\dfrac{Q r}{4\\pi\\varepsilon_0 R^3}$.', why: 'Charge proportionnelle au volume.' }] }, 3, ['Gauss']],
      [3, { type: 'truefalse', statement: 'Le champ électrostatique est dirigé vers les potentiels croissants.', answer: false, correctedStatement: 'Le champ électrostatique est dirigé vers les potentiels décroissants.', explanation: '$\\vec{E} = -\\overrightarrow{\\mathrm{grad}}\\, V$.' }, 2, ['potentiel']],
      [3, { type: 'flashcard', question: 'Quelle est l’orientation des surfaces équipotentielles par rapport aux lignes de champ ?', answer: 'Elles leur sont orthogonales.' }, 1, ['potentiel']],
      [4, { type: 'match', instruction: 'Associe chaque grandeur du condensateur plan à son expression.', pairs: [{ left: 'Capacité', right: '$\\varepsilon_0 S / e$' }, { left: 'Énergie stockée', right: '$\\tfrac{1}{2} C U^2$' }, { left: 'Champ entre les armatures', right: '$U/e$' }, { left: 'Charge', right: '$C U$' }] }, 2, ['condensateur']],
      [4, { type: 'flashcard', question: 'Quelle est la capacité d’un condensateur plan de surface $S$ et d’épaisseur $e$ ?', answer: '$C = \\dfrac{\\varepsilon_0 S}{e}$', typed: true }, 1, ['condensateur', 'formule']],
      [null, { type: 'rappel_libre', topic: 'Électrostatique', checklist: [{ text: 'Loi de Coulomb' }, { text: 'Champ d’une charge ponctuelle' }, { text: 'Superposition' }, { text: 'Théorème de Gauss' }, { text: '$\\vec{E} = -\\overrightarrow{\\mathrm{grad}}\\, V$' }, { text: 'Capacité et énergie du condensateur plan' }] }, 2, []],
    ],
  },
  {
    id: 'fiche-mecanique',
    cahier: 'cahier-physique',
    title: 'Mécanique du point',
    content: `## Cinématique
Position $\\vec{r}(t)$, vitesse $\\vec{v} = \\dfrac{\\mathrm{d}\\vec{r}}{\\mathrm{d}t}$, accélération $\\vec{a} = \\dfrac{\\mathrm{d}\\vec{v}}{\\mathrm{d}t}$. Dans un mouvement circulaire uniforme de rayon $R$, l'accélération est centripète : $a = \\dfrac{v^2}{R} = R\\omega^2$.

## Lois de Newton
**Deuxième loi** : dans un référentiel galiléen, $\\sum \\vec{F} = m\\vec{a}$. Le poids vaut $\\vec{P} = m\\vec{g}$ avec $g = 9{,}8\\ \\mathrm{m\\cdot s^{-2}}$.

## Énergie
Énergie cinétique $E_c = \\dfrac{1}{2} m v^2$. Théorème de l'énergie cinétique : $\\Delta E_c = \\sum W(\\vec{F})$. Énergie potentielle de pesanteur $E_p = m g z$. Un système conservatif conserve $E_m = E_c + E_p$.

## Oscillateur harmonique
Ressort de raideur $k$ : $\\ddot{x} + \\omega_0^2 x = 0$ avec $\\omega_0 = \\sqrt{k/m}$, période $T_0 = 2\\pi\\sqrt{m/k}$.

## L'essentiel
- $\\sum \\vec{F} = m\\vec{a}$ en référentiel galiléen.
- $E_c = \\tfrac{1}{2} m v^2$, $\\Delta E_c = \\sum W$.
- $T_0 = 2\\pi\\sqrt{m/k}$.`,
    points: [
      ['formule', 'Accélération centripète', 'l\'accélération est centripète : $a = \\dfrac{v^2}{R} = R\\omega^2$'],
      ['theoreme', 'Deuxième loi de Newton', 'dans un référentiel galiléen, $\\sum \\vec{F} = m\\vec{a}$'],
      ['theoreme', 'Théorème de l’énergie cinétique', 'Théorème de l\'énergie cinétique : $\\Delta E_c = \\sum W(\\vec{F})$'],
      ['formule', 'Période de l’oscillateur harmonique', 'période $T_0 = 2\\pi\\sqrt{m/k}$'],
    ],
    exercises: [
      [0, { type: 'flashcard', question: 'Expression de l’accélération dans un mouvement circulaire uniforme de rayon $R$ ?', answer: '$a = \\dfrac{v^2}{R} = R\\omega^2$, centripète.', typed: true }, 2, ['cinématique', 'formule']],
      [1, { type: 'flashcard', question: 'Énoncé de la deuxième loi de Newton ?', answer: 'Dans un référentiel galiléen, $\\sum \\vec{F} = m\\vec{a}$.' }, 1, ['Newton']],
      [1, { type: 'truefalse', statement: 'La deuxième loi de Newton s’applique dans tout référentiel.', answer: false, correctedStatement: 'La deuxième loi de Newton s’applique dans un référentiel galiléen.', explanation: 'Sinon il faut ajouter les forces d’inertie.' }, 2, ['Newton']],
      [1, { type: 'mcq', question: 'Que vaut le poids d’une masse de 2 kg ?', choices: ['$19{,}6\\ \\mathrm{N}$', '$2\\ \\mathrm{N}$', '$9{,}8\\ \\mathrm{N}$', '$4{,}9\\ \\mathrm{N}$'], correct: [0], distractorReasons: ['', 'Oubli de $g$.', 'Masse de 1 kg.', 'Division au lieu du produit.'], explanation: '$P = mg = 2 \\times 9{,}8$.' }, 1, ['Newton']],
      [2, { type: 'cloze', text: 'Le théorème de l’énergie cinétique s’écrit {{$\\Delta E_c = \\sum W(\\vec{F})$}}.' }, 2, ['énergie']],
      [2, { type: 'flashcard', question: 'Quelle est l’expression de l’énergie cinétique ?', answer: '$E_c = \\dfrac{1}{2} m v^2$', typed: true }, 1, ['énergie', 'formule']],
      [2, { type: 'demonstration', title: 'Vitesse d’un objet lâché sans vitesse initiale', statement: 'Montrer que la vitesse après une chute de hauteur $h$ vaut $v = \\sqrt{2gh}$.', steps: [{ text: 'Système : l’objet, référentiel terrestre galiléen ; seule force qui travaille : le poids.' }, { text: 'Théorème de l’énergie cinétique : $\\tfrac{1}{2} m v^2 - 0 = W(\\vec{P}) = mgh$.', why: 'Le poids est conservatif, son travail ne dépend que de la dénivelée.' }, { text: 'Donc $v = \\sqrt{2gh}$.' }] }, 2, ['énergie']],
      [3, { type: 'flashcard', question: 'Période propre d’un oscillateur masse–ressort ?', answer: '$T_0 = 2\\pi\\sqrt{m/k}$', typed: true }, 1, ['oscillateur', 'formule']],
      [3, { type: 'mcq', question: 'Si on quadruple la masse d’un oscillateur masse–ressort, sa période…', choices: ['double', 'est divisée par deux', 'quadruple', 'ne change pas'], correct: [0], distractorReasons: ['', 'Sens inverse.', '$T \\propto \\sqrt{m}$.', 'Elle dépend de $m$.'], explanation: '$T_0 \\propto \\sqrt{m}$.' }, 2, ['oscillateur']],
      [3, { type: 'order', instruction: 'Remets dans l’ordre la résolution de $\\ddot{x} + \\omega_0^2 x = 0$.', items: ['Identifier une équation d’oscillateur harmonique', 'Écrire la solution générale $x = A\\cos(\\omega_0 t) + B\\sin(\\omega_0 t)$', 'Utiliser les conditions initiales', 'Conclure sur l’amplitude et la phase'] }, 2, ['oscillateur']],
      [null, { type: 'rappel_libre', topic: 'Mécanique du point', checklist: [{ text: 'Vitesse et accélération' }, { text: 'Accélération centripète' }, { text: 'Deuxième loi de Newton' }, { text: 'Théorème de l’énergie cinétique' }, { text: 'Oscillateur harmonique' }] }, 2, []],
    ],
    // Pending exercises: the validation page needs some.
    pending: [
      [0, { type: 'flashcard', question: 'Relation entre vitesse angulaire et vitesse dans un mouvement circulaire ?', answer: '$v = R\\omega$', typed: true }, 1, ['cinématique'], true],
      [1, { type: 'cloze', text: 'Le poids d’un corps vaut {{$\\vec{P} = m\\vec{g}$}} avec $g = 9{,}8\\ \\mathrm{m\\cdot s^{-2}}$.' }, 1, ['Newton'], false],
      [2, { type: 'flashcard', question: 'Cite les trois formes d’énergie mécanique vues dans la fiche.', answer: 'Cinétique, potentielle de pesanteur, mécanique.' }, 1, ['énergie'], false],
      [3, { type: 'truefalse', statement: 'La période d’un oscillateur harmonique dépend de l’amplitude.', answer: false, correctedStatement: 'La période d’un oscillateur harmonique ne dépend pas de l’amplitude (isochronisme).', explanation: 'Isochronisme des petites oscillations.' }, 2, ['oscillateur'], false],
    ],
  },
  {
    id: 'fiche-thermo',
    cahier: 'cahier-chimie',
    title: 'Thermodynamique chimique',
    content: `## Fonctions d'état
L'enthalpie libre $G = H - TS$ décide du sens d'évolution : à $T$ et $p$ constantes, une transformation spontanée vérifie $\\Delta G < 0$. Relation fondamentale : $\\Delta_r G^\\circ = \\Delta_r H^\\circ - T\\Delta_r S^\\circ$.

## Constante d'équilibre
$\\Delta_r G^\\circ = -RT\\ln K^\\circ$ avec $R = 8{,}314\\ \\mathrm{J\\cdot K^{-1}\\cdot mol^{-1}}$. Loi de Van 't Hoff : $\\dfrac{\\mathrm{d}\\ln K^\\circ}{\\mathrm{d}T} = \\dfrac{\\Delta_r H^\\circ}{RT^2}$.

## Exemple
Synthèse de l'ammoniac : $\\ce{N2 + 3H2 <=> 2NH3}$, exothermique ($\\Delta_r H^\\circ = -92\\ \\mathrm{kJ\\cdot mol^{-1}}$) : une hausse de température déplace l'équilibre vers les réactifs (Le Chatelier).

## L'essentiel
- $\\Delta_r G^\\circ = \\Delta_r H^\\circ - T\\Delta_r S^\\circ = -RT\\ln K^\\circ$.
- Van 't Hoff : $K^\\circ$ croît avec $T$ si la réaction est endothermique.`,
    points: [
      ['formule', 'Enthalpie libre standard', '$\\Delta_r G^\\circ = \\Delta_r H^\\circ - T\\Delta_r S^\\circ$'],
      ['formule', 'Constante d’équilibre', '$\\Delta_r G^\\circ = -RT\\ln K^\\circ$'],
      ['theoreme', 'Loi de Van ’t Hoff', 'Loi de Van \'t Hoff : $\\dfrac{\\mathrm{d}\\ln K^\\circ}{\\mathrm{d}T} = \\dfrac{\\Delta_r H^\\circ}{RT^2}$'],
    ],
    exercises: [
      [0, { type: 'flashcard', question: 'Relation entre $\\Delta_r G^\\circ$, $\\Delta_r H^\\circ$ et $\\Delta_r S^\\circ$ ?', answer: '$\\Delta_r G^\\circ = \\Delta_r H^\\circ - T\\Delta_r S^\\circ$', typed: true }, 1, ['thermo', 'formule']],
      [0, { type: 'truefalse', statement: 'À $T$ et $p$ constantes, une transformation spontanée vérifie $\\Delta G > 0$.', answer: false, correctedStatement: 'À $T$ et $p$ constantes, une transformation spontanée vérifie $\\Delta G < 0$.' }, 1, ['thermo']],
      [1, { type: 'cloze', text: 'La constante d’équilibre est liée à l’enthalpie libre standard par {{$\\Delta_r G^\\circ = -RT\\ln K^\\circ$}}.' }, 2, ['équilibre']],
      [1, { type: 'mcq', question: 'Que vaut $R$ ?', choices: ['$8{,}314\\ \\mathrm{J\\cdot K^{-1}\\cdot mol^{-1}}$', '$8{,}314\\ \\mathrm{kJ\\cdot K^{-1}\\cdot mol^{-1}}$', '$1{,}38\\cdot 10^{-23}\\ \\mathrm{J\\cdot K^{-1}}$', '$6{,}02\\cdot 10^{23}\\ \\mathrm{mol^{-1}}$'], correct: [0], distractorReasons: ['', 'Mauvaise unité.', 'C’est $k_B$.', 'C’est $N_A$.'] }, 1, ['constantes']],
      [2, { type: 'flashcard', question: 'Dans quel sens une hausse de température déplace-t-elle un équilibre exothermique ?', answer: 'Vers les réactifs (Le Chatelier).' }, 2, ['équilibre']],
      [2, { type: 'flashcard', question: 'Équation-bilan de la synthèse de l’ammoniac ?', answer: '$\\ce{N2 + 3H2 <=> 2NH3}$', typed: true }, 1, ['ammoniac']],
      [2, { type: 'match', instruction: 'Associe chaque grandeur à son signe pour la synthèse de l’ammoniac.', pairs: [{ left: '$\\Delta_r H^\\circ$', right: 'négatif (exothermique)' }, { left: '$\\Delta_r S^\\circ$', right: 'négatif (4 mol de gaz → 2)' }, { left: '$K^\\circ$ quand $T$ augmente', right: 'diminue' }] }, 2, ['équilibre']],
      [null, { type: 'rappel_libre', topic: 'Thermodynamique chimique', checklist: [{ text: 'Enthalpie libre et spontanéité' }, { text: '$\\Delta_r G^\\circ = -RT\\ln K^\\circ$' }, { text: 'Van ’t Hoff' }, { text: 'Le Chatelier' }] }, 2, []],
    ],
    supplements: [
      ['manque', 'Affinité chimique', 'Le programme demande la définition de l’affinité chimique.', '### Affinité chimique\nL’affinité $\\mathcal{A} = -\\Delta_r G = -RT\\ln\\dfrac{Q}{K^\\circ}$ : l’évolution se fait dans le sens où $\\mathcal{A}\\,\\mathrm{d}\\xi > 0$.'],
      ['precision', 'Domaine de validité de Van ’t Hoff', 'La fiche ne précise pas que $\\Delta_r H^\\circ$ est supposé indépendant de $T$.', 'L’intégration de Van ’t Hoff entre $T_1$ et $T_2$ suppose $\\Delta_r H^\\circ$ constant (approximation d’Ellingham) : $\\ln\\dfrac{K_2}{K_1} = -\\dfrac{\\Delta_r H^\\circ}{R}\\left(\\dfrac{1}{T_2} - \\dfrac{1}{T_1}\\right)$.'],
    ],
  },
  {
    id: 'fiche-cinetique',
    cahier: 'cahier-chimie',
    title: 'Cinétique chimique',
    content: `## Vitesse de réaction
Pour $\\ce{aA + bB -> cC}$, la vitesse volumique vaut $v = -\\dfrac{1}{a}\\dfrac{\\mathrm{d}[A]}{\\mathrm{d}t} = \\dfrac{1}{c}\\dfrac{\\mathrm{d}[C]}{\\mathrm{d}t}$.

## Ordre
Loi de vitesse $v = k[A]^\\alpha[B]^\\beta$ ; l'ordre global est $\\alpha + \\beta$. Pour un ordre 1 : $[A] = [A]_0 e^{-kt}$, temps de demi-réaction $t_{1/2} = \\dfrac{\\ln 2}{k}$, indépendant de $[A]_0$.

## Loi d'Arrhenius
$k = A\\, e^{-E_a/RT}$ : la constante de vitesse croît avec la température ; $E_a$ est l'énergie d'activation.

## L'essentiel
- Ordre 1 : décroissance exponentielle, $t_{1/2} = \\ln 2 / k$.
- Arrhenius : $\\ln k = \\ln A - E_a/(RT)$.`,
    points: [
      ['definition', 'Vitesse volumique de réaction', 'la vitesse volumique vaut $v = -\\dfrac{1}{a}\\dfrac{\\mathrm{d}[A]}{\\mathrm{d}t}$'],
      ['formule', 'Ordre 1 : demi-réaction', 'temps de demi-réaction $t_{1/2} = \\dfrac{\\ln 2}{k}$'],
      ['formule', 'Loi d’Arrhenius', '$k = A\\, e^{-E_a/RT}$'],
    ],
    exercises: [
      [0, { type: 'flashcard', question: 'Définition de la vitesse volumique pour $\\ce{aA + bB -> cC}$ ?', answer: '$v = -\\dfrac{1}{a}\\dfrac{\\mathrm{d}[A]}{\\mathrm{d}t} = \\dfrac{1}{c}\\dfrac{\\mathrm{d}[C]}{\\mathrm{d}t}$', typed: true }, 2, ['cinétique', 'formule']],
      [1, { type: 'flashcard', question: 'Temps de demi-réaction d’une réaction d’ordre 1 ?', answer: '$t_{1/2} = \\dfrac{\\ln 2}{k}$, indépendant de $[A]_0$.', typed: true }, 1, ['ordre 1', 'formule']],
      [1, { type: 'truefalse', statement: 'Pour un ordre 1, le temps de demi-réaction dépend de la concentration initiale.', answer: false, correctedStatement: 'Pour un ordre 1, le temps de demi-réaction ne dépend pas de la concentration initiale.' }, 1, ['ordre 1']],
      [1, { type: 'cloze', text: 'Pour un ordre 1, la concentration suit {{$[A] = [A]_0 e^{-kt}$}}.' }, 2, ['ordre 1']],
      [2, { type: 'flashcard', question: 'Loi d’Arrhenius ?', answer: '$k = A\\, e^{-E_a/RT}$', typed: true }, 1, ['Arrhenius', 'formule']],
      [2, { type: 'mcq', question: 'Quand la température augmente, la constante de vitesse $k$…', choices: ['augmente', 'diminue', 'ne change pas', 'devient négative'], correct: [0], distractorReasons: ['', 'Sens inverse.', 'Elle dépend de $T$.', 'Une constante de vitesse est positive.'], explanation: 'Arrhenius : $k = A e^{-E_a/RT}$.' }, 1, ['Arrhenius']],
      [2, { type: 'order', instruction: 'Remets dans l’ordre la détermination de $E_a$ à partir de mesures de $k(T)$.', items: ['Mesurer $k$ à plusieurs températures', 'Tracer $\\ln k$ en fonction de $1/T$', 'Vérifier l’alignement des points', 'Lire la pente $-E_a/R$', 'En déduire $E_a$'] }, 2, ['Arrhenius', 'méthode']],
      [null, { type: 'rappel_libre', topic: 'Cinétique chimique', checklist: [{ text: 'Vitesse volumique' }, { text: 'Ordre et loi de vitesse' }, { text: 'Ordre 1 et $t_{1/2}$' }, { text: 'Arrhenius' }] }, 2, []],
    ],
  },
  {
    id: 'fiche-suites',
    cahier: 'cahier-maths',
    title: 'Suites numériques',
    content: `## Suites usuelles
Suite arithmétique : $u_n = u_0 + nr$, somme $\\sum_{k=0}^{n} u_k = (n+1)\\dfrac{u_0 + u_n}{2}$. Suite géométrique de raison $q \\neq 1$ : $u_n = u_0 q^n$, $\\sum_{k=0}^{n} q^k = \\dfrac{1 - q^{n+1}}{1 - q}$.

## Convergence
Toute suite croissante et majorée converge (théorème de la limite monotone). Théorème des gendarmes : si $a_n \\le u_n \\le b_n$ et $a_n, b_n \\to \\ell$, alors $u_n \\to \\ell$.

## Suites adjacentes
Deux suites adjacentes ($u_n$ croissante, $v_n$ décroissante, $v_n - u_n \\to 0$) convergent vers la même limite.

## L'essentiel
- $\\sum_{k=0}^{n} q^k = \\dfrac{1-q^{n+1}}{1-q}$.
- Croissante et majorée ⇒ convergente.`,
    points: [
      ['formule', 'Somme géométrique', '$\\sum_{k=0}^{n} q^k = \\dfrac{1 - q^{n+1}}{1 - q}$'],
      ['theoreme', 'Limite monotone', 'Toute suite croissante et majorée converge'],
      ['theoreme', 'Théorème des gendarmes', 'si $a_n \\le u_n \\le b_n$ et $a_n, b_n \\to \\ell$, alors $u_n \\to \\ell$'],
    ],
    exercises: [
      [0, { type: 'flashcard', question: 'Que vaut $\\sum_{k=0}^{n} q^k$ pour $q \\neq 1$ ?', answer: '$\\dfrac{1 - q^{n+1}}{1 - q}$', typed: true }, 1, ['suites', 'formule']],
      [0, { type: 'mcq', question: 'Vers quoi converge $\\sum_{k=0}^{n} q^k$ quand $n \\to +\\infty$, pour $|q| < 1$ ?', choices: ['$\\dfrac{1}{1-q}$', '$\\dfrac{1}{1+q}$', '$\\dfrac{q}{1-q}$', 'Elle diverge'], correct: [0], distractorReasons: ['', 'Signe du dénominateur.', 'Somme à partir de $k=1$.', 'Converge pour $|q|<1$.'] }, 2, ['suites']],
      [0, { type: 'flashcard', question: 'Combien de termes compte la somme $\\sum_{k=0}^{n} q^k$ ?', answer: '$n + 1$ termes.' }, 1, ['suites']],
      [1, { type: 'truefalse', statement: 'Toute suite croissante converge.', answer: false, correctedStatement: 'Toute suite croissante et majorée converge.', explanation: 'Contre-exemple : $u_n = n$.' }, 1, ['convergence']],
      [1, { type: 'cloze', text: 'Toute suite croissante et {{majorée}} converge.' }, 1, ['convergence']],
      [2, { type: 'flashcard', question: 'Énoncé du théorème des gendarmes ?', answer: 'Si $a_n \\le u_n \\le b_n$ et $a_n, b_n \\to \\ell$, alors $u_n \\to \\ell$.' }, 2, ['convergence']],
      [2, { type: 'demonstration', title: 'Limite de $\\dfrac{\\sin n}{n}$', statement: 'Montrer que $u_n = \\dfrac{\\sin n}{n} \\to 0$.', steps: [{ text: 'Encadrement : $-\\dfrac{1}{n} \\le \\dfrac{\\sin n}{n} \\le \\dfrac{1}{n}$.', why: '$|\\sin n| \\le 1$.' }, { text: 'Les deux bornes tendent vers 0.' }, { text: 'Théorème des gendarmes : $u_n \\to 0$.' }] }, 2, ['convergence']],
      [null, { type: 'match', instruction: 'Associe chaque suite à sa nature.', pairs: [{ left: '$u_n = 3 + 2n$', right: 'arithmétique de raison 2' }, { left: '$u_n = 5 \\cdot 3^n$', right: 'géométrique de raison 3' }, { left: '$u_n = 1/n$', right: 'décroissante, tend vers 0' }, { left: '$u_n = (-1)^n$', right: 'bornée, divergente' }] }, 1, ['suites']],
      [null, { type: 'rappel_libre', topic: 'Suites numériques', checklist: [{ text: 'Suites arithmétiques et géométriques' }, { text: 'Somme géométrique' }, { text: 'Limite monotone' }, { text: 'Gendarmes' }, { text: 'Suites adjacentes' }] }, 2, []],
    ],
  },
  {
    id: 'fiche-integration',
    cahier: 'cahier-maths',
    title: 'Intégration',
    content: `## Primitives et intégrale
Si $F' = f$ sur $[a, b]$, alors $\\int_a^b f(t)\\,\\mathrm{d}t = F(b) - F(a)$. Linéarité, positivité, relation de Chasles.

## Intégration par parties
Pour $u, v$ de classe $\\mathcal{C}^1$ : $\\int_a^b u'v = [uv]_a^b - \\int_a^b uv'$.

## Changement de variable
Si $\\varphi$ est $\\mathcal{C}^1$ : $\\int_{\\varphi(a)}^{\\varphi(b)} f(x)\\,\\mathrm{d}x = \\int_a^b f(\\varphi(t))\\,\\varphi'(t)\\,\\mathrm{d}t$.

## Intégrales classiques
$\\int_0^{\\pi} \\sin x\\,\\mathrm{d}x = 2$, $\\int_1^e \\dfrac{\\mathrm{d}x}{x} = 1$, $\\int_0^{+\\infty} e^{-x^2}\\,\\mathrm{d}x = \\dfrac{\\sqrt{\\pi}}{2}$.

## L'essentiel
- IPP : $\\int u'v = [uv] - \\int uv'$.
- Gauss : $\\int_0^{+\\infty} e^{-x^2}\\,\\mathrm{d}x = \\sqrt{\\pi}/2$.`,
    points: [
      ['methode', 'Intégration par parties', '$\\int_a^b u\'v = [uv]_a^b - \\int_a^b uv\''],
      ['methode', 'Changement de variable', '$\\int_{\\varphi(a)}^{\\varphi(b)} f(x)\\,\\mathrm{d}x = \\int_a^b f(\\varphi(t))\\,\\varphi\'(t)\\,\\mathrm{d}t$'],
      ['formule', 'Intégrale de Gauss', '$\\int_0^{+\\infty} e^{-x^2}\\,\\mathrm{d}x = \\dfrac{\\sqrt{\\pi}}{2}$'],
    ],
    exercises: [
      [0, { type: 'flashcard', question: 'Formule d’intégration par parties sur $[a, b]$ ?', answer: '$\\int_a^b u\'v = [uv]_a^b - \\int_a^b uv\'$', typed: true }, 2, ['intégration', 'formule']],
      [0, { type: 'order', instruction: 'Remets dans l’ordre le calcul de $\\int_0^1 x e^x\\,\\mathrm{d}x$ par parties.', items: ['Poser $u = x$ et $v\' = e^x$', 'En déduire $u\' = 1$ et $v = e^x$', 'Écrire $[x e^x]_0^1 - \\int_0^1 e^x\\,\\mathrm{d}x$', 'Calculer $e - (e - 1)$', 'Conclure : l’intégrale vaut $1$'] }, 2, ['intégration']],
      [0, { type: 'demonstration', title: 'Intégration par parties', statement: 'Démontrer $\\int_a^b u\'v = [uv]_a^b - \\int_a^b uv\'$.', steps: [{ text: '$(uv)\' = u\'v + uv\'$.', why: 'Dérivée d’un produit.' }, { text: '$\\int_a^b (u\'v + uv\') = [uv]_a^b$.', why: 'Théorème fondamental.' }, { text: 'Linéarité : $\\int_a^b u\'v = [uv]_a^b - \\int_a^b uv\'$.' }] }, 3, ['intégration']],
      [1, { type: 'flashcard', question: 'Formule du changement de variable $x = \\varphi(t)$ ?', answer: '$\\int_{\\varphi(a)}^{\\varphi(b)} f(x)\\,\\mathrm{d}x = \\int_a^b f(\\varphi(t))\\,\\varphi\'(t)\\,\\mathrm{d}t$', typed: true }, 2, ['intégration', 'formule']],
      [2, { type: 'flashcard', question: 'Que vaut $\\int_0^{+\\infty} e^{-x^2}\\,\\mathrm{d}x$ ?', answer: '$\\dfrac{\\sqrt{\\pi}}{2}$', typed: true }, 2, ['Gauss', 'formule']],
      [2, { type: 'match', instruction: 'Associe chaque intégrale à sa valeur.', pairs: [{ left: '$\\int_0^1 x\\,\\mathrm{d}x$', right: '$\\tfrac{1}{2}$' }, { left: '$\\int_0^{\\pi} \\sin x\\,\\mathrm{d}x$', right: '$2$' }, { left: '$\\int_1^e \\dfrac{\\mathrm{d}x}{x}$', right: '$1$' }, { left: '$\\int_0^{+\\infty} e^{-x^2}\\,\\mathrm{d}x$', right: '$\\sqrt{\\pi}/2$' }] }, 2, ['intégration']],
      [null, { type: 'truefalse', statement: 'L’intégrale d’une fonction positive sur $[a,b]$ avec $a < b$ est positive.', answer: true, correctedStatement: 'L’intégrale d’une fonction positive sur $[a,b]$ avec $a < b$ est positive.' }, 1, ['intégration']],
      [null, { type: 'cloze', text: 'Relation de {{Chasles}} : $\\int_a^c = \\int_a^b + \\int_b^c$.' }, 1, ['intégration']],
      [null, { type: 'rappel_libre', topic: 'Intégration', checklist: [{ text: 'Théorème fondamental' }, { text: 'IPP' }, { text: 'Changement de variable' }, { text: 'Intégrale de Gauss' }] }, 2, []],
    ],
  },
]

const CAHIERS = [
  { id: 'cahier-physique', name: 'Physique', color: '#3b6cf6', programme: 'Programme PC : électrostatique, mécanique du point, induction.' },
  { id: 'cahier-chimie', name: 'Chimie', color: '#15a36a', programme: 'Programme PC : thermodynamique chimique, cinétique, oxydoréduction.' },
  { id: 'cahier-maths', name: 'Mathématiques', color: '#e08a1e' },
]

const MINDMAP = {
  id: 'mm-electrostatique',
  cahierId: 'cahier-physique',
  chapitreId: 'fiche-electrostatique',
  title: 'Électrostatique',
  root: {
    label: 'Électrostatique',
    children: [
      { label: 'Loi de Coulomb', note: '$F = q_1 q_2 / (4\\pi\\varepsilon_0 r^2)$', children: [{ label: 'Attractive / répulsive', note: 'selon les signes' }, { label: '$\\varepsilon_0$', note: '$8{,}85\\cdot 10^{-12}$ F/m' }] },
      { label: 'Champ $\\vec{E}$', children: [{ label: 'Charge ponctuelle', note: '$q / (4\\pi\\varepsilon_0 r^2)$' }, { label: 'Superposition', note: 'somme vectorielle' }, { label: 'Unité', note: 'V/m' }] },
      { label: 'Théorème de Gauss', note: '$\\Phi = Q_{int}/\\varepsilon_0$', children: [{ label: 'Sphère' }, { label: 'Cylindre infini' }, { label: 'Plan infini' }] },
      { label: 'Potentiel $V$', children: [{ label: '$\\vec{E} = -\\mathrm{grad}\\,V$' }, { label: 'Équipotentielles', note: 'orthogonales aux lignes de champ' }] },
      { label: 'Condensateur plan', children: [{ label: '$C = \\varepsilon_0 S / e$' }, { label: '$\\mathcal{E} = \\tfrac{1}{2} C U^2$' }] },
    ],
  },
}

// ---- Build ---------------------------------------------------------------------

function toMs(card) {
  const c = {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
  }
  if (card.last_review) c.last_review = card.last_review.getTime()
  return c
}

export function buildDemo(now = Date.now()) {
  const rand = rng(20260912)
  const pick = (arr) => arr[Math.floor(rand() * arr.length)]
  const scheduler = fsrs({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: false, enable_short_term: true, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] })
  const start = now - 60 * DAY
  const cahiers = CAHIERS.map((c, i) => ({ ...c, createdAt: start - (3 - i) * DAY, updatedAt: start }))
  const chapitres = []
  const points = []
  const exercises = []
  const reviewLogs = []
  const supplements = []
  const mindmaps = [{ ...MINDMAP, createdAt: start + 5 * DAY, updatedAt: start + 5 * DAY }]

  let logSeq = 0
  for (const fiche of FICHES) {
    chapitres.push({ id: fiche.id, cahierId: fiche.cahier, title: fiche.title, content: fiche.content, source: pick(['paste', 'docx', 'onenote', 'claude']), createdAt: start, updatedAt: start + Math.floor(rand() * 30) * DAY })
    const pointIds = fiche.points.map(([nature, title, anchor], i) => {
      const id = `${fiche.id}-p${i + 1}`
      points.push({ id, chapitreId: fiche.id, cahierId: fiche.cahier, anchor, title, nature, order: i, createdAt: start })
      return id
    })
    const addExercise = (pointIdx, data, difficulty, tags, status, extra = {}) => {
      const id = `${fiche.id}-e${exercises.length + 1}`
      const createdAt = start + Math.floor(rand() * 5) * DAY + exercises.length
      let fsrsCard = toMs(createEmptyCard(new Date(createdAt)))
      if (status === 'active' && data.type !== 'carte_trous' && rand() < 0.85) {
        // Replay a 60-day history: first review somewhere in the first 40 days, then on due.
        let card = createEmptyCard(new Date(createdAt))
        let t = createdAt + Math.floor(rand() * 40) * DAY + Math.floor(rand() * 10) * 3_600_000
        const strong = rand() < 0.6
        let guard = 0
        while (t < now && guard++ < 40) {
          const r = rand()
          const rating = r < (strong ? 0.08 : 0.2) ? 1 : r < 0.25 ? 2 : r < 0.9 ? 3 : 4
          const res = scheduler.next(card, new Date(t), rating)
          const prev = toMs(card)
          card = res.card
          const next = toMs(card)
          const log = res.log
          reviewLogs.push({
            id: `log-${++logSeq}`,
            exerciseId: id,
            chapitreId: fiche.id,
            cahierId: fiche.cahier,
            ts: t,
            rating,
            correct: rating > 1,
            confidence: rand() < 0.7 ? (rating >= 3 ? (rand() < 0.75 ? 3 : 2) : rand() < 0.5 ? 1 : 2) : undefined,
            durationMs: 4000 + Math.floor(rand() * 12000),
            mode: 'review',
            fsrsLog: { prev, next, log: { rating: log.rating, state: log.state, due: log.due.getTime(), stability: log.stability, difficulty: log.difficulty, elapsed_days: log.elapsed_days, last_elapsed_days: log.last_elapsed_days, scheduled_days: log.scheduled_days, learning_steps: log.learning_steps, review: log.review.getTime() } },
            affectsScheduling: true,
          })
          // Next review on the due date (a little late sometimes).
          t = card.due.getTime() + (rand() < 0.3 ? Math.floor(rand() * 2) * DAY : 0) + Math.floor(rand() * 6) * 3_600_000
          if (card.due.getTime() > now) break
        }
        fsrsCard = toMs(card)
        // Keep a realistic backlog: about 45 % of the reviewed cards are due today or a few days late.
        if (card.state === 2 && rand() < 0.45) fsrsCard.due = now - Math.floor(rand() * 4) * DAY - 3_600_000
      }
      exercises.push({
        id,
        chapitreId: fiche.id,
        cahierId: fiche.cahier,
        pointId: pointIdx === null ? null : pointIds[pointIdx],
        type: data.type,
        data,
        difficulty,
        tags,
        status,
        origin: 'claude',
        fsrs: fsrsCard,
        ...(data.type === 'demonstration' ? { fading: { level: 1, streak: 0 } } : {}),
        ...extra,
        createdAt,
        updatedAt: createdAt,
      })
      return id
    }
    for (const [p, data, difficulty, tags] of fiche.exercises) addExercise(p, data, difficulty, tags, 'active')
    for (const [p, data, difficulty, tags, repaired] of fiche.pending ?? []) addExercise(p, data, difficulty, tags, 'pending', repaired ? { repaired: true } : {})
    for (const [kind, title, reason, content] of fiche.supplements ?? []) {
      supplements.push({ id: `${fiche.id}-s${supplements.length + 1}`, chapitreId: fiche.id, cahierId: fiche.cahier, title, kind, reason, content, status: 'pending', createdAt: now - 2 * DAY })
    }
    if (fiche.id === MINDMAP.chapitreId) {
      addExercise(null, { type: 'carte_trous', mindmapId: MINDMAP.id, variant: 'trous' }, 2, [], 'active')
      addExercise(null, { type: 'carte_trous', mindmapId: MINDMAP.id, variant: 'reconstruction' }, 3, [], 'active')
    }
  }

  // Exam in 21 days on the two physics fiches, successive-relearning plan J−12 / J−6 / J−1.
  const examDate = dayStart(now + 21 * DAY)
  const physique = cahiers.find((c) => c.id === 'cahier-physique')
  physique.examens = [
    {
      id: 'exam-ds-physique',
      name: 'DS de physique',
      date: examDate,
      chapitreIds: ['fiche-electrostatique', 'fiche-mecanique'],
      boostFromDays: 14,
      sessions: [12, 6, 1].map((d) => ({ at: examDate - d * DAY })),
      createdAt: now - 3 * DAY,
    },
  ]

  return {
    app: 'cahiers',
    version: 4,
    schemaVersion: 4,
    exportedAt: now,
    cahiers,
    chapitres,
    exercises,
    reviewLogs,
    points,
    supplements,
    mindmaps,
    settings: { id: 'app', theme: 'dark', niveau: 'PC (2e année de prépa)', askConfidence: false, typedFlashcards: false },
  }
}

/** Ids the screenshot script relies on. */
export const DEMO_IDS = {
  cahier: 'cahier-physique',
  fiche: 'fiche-electrostatique',
  ficheWithPending: 'fiche-mecanique',
  mindmap: 'mm-electrostatique',
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  const out = process.argv[2] ?? fileURLToPath(new URL('../docs/demo/demo-backup.json', import.meta.url))
  const demo = buildDemo()
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(demo))
  const due = demo.exercises.filter((e) => e.status === 'active' && e.fsrs.due <= Date.now()).length
  console.log(`${out} : ${demo.cahiers.length} cahiers, ${demo.chapitres.length} fiches, ${demo.exercises.length} exercices (${due} dus), ${demo.reviewLogs.length} réponses, ${demo.points.length} points`)
}
