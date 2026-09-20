// The vocabulary of the « mécanisme » exercise: what kind of elementary step is this?

export interface ReactionType {
  id: string
  /** Short name shown on the answer chips. */
  label: string
  /** Full name, shown in the correction. */
  long: string
}

export const REACTION_TYPES: ReactionType[] = [
  { id: 'SN1', label: 'SN1', long: 'Substitution nucléophile monomoléculaire' },
  { id: 'SN2', label: 'SN2', long: 'Substitution nucléophile bimoléculaire' },
  { id: 'E1', label: 'E1', long: 'Élimination monomoléculaire' },
  { id: 'E2', label: 'E2', long: 'Élimination bimoléculaire' },
  { id: 'AdN', label: 'AdN', long: 'Addition nucléophile' },
  { id: 'AdE', label: 'AdE', long: 'Addition électrophile' },
  { id: 'AdN-E', label: 'AdN-E', long: 'Addition-élimination (substitution nucléophile acyle)' },
  { id: 'SEAr', label: 'SEAr', long: 'Substitution électrophile aromatique' },
  { id: 'acide-base', label: 'Acido-basique', long: 'Réaction acido-basique (transfert de proton)' },
  { id: 'redox', label: 'Redox', long: 'Oxydo-réduction (transfert d’électrons)' },
  { id: 'radicalaire', label: 'Radicalaire', long: 'Réaction radicalaire' },
  { id: 'pericyclique', label: 'Péricyclique', long: 'Réaction péricyclique (Diels-Alder…)' },
  { id: 'transposition', label: 'Transposition', long: 'Transposition' },
  { id: 'complexation', label: 'Complexation', long: 'Complexation' },
]

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')

/** What Claude (or a teacher) may write for a type, folded (no accent, no punctuation, lower case). */
const ALIASES: Record<string, string> = {
  an: 'AdN',
  adn: 'AdN',
  additionnucleophile: 'AdN',
  ae: 'AdE',
  ade: 'AdE',
  additionelectrophile: 'AdE',
  adne: 'AdN-E',
  ane: 'AdN-E',
  additionelimination: 'AdN-E',
  substitutionnucleophileacyle: 'AdN-E',
  snacyle: 'AdN-E',
  sear: 'SEAr',
  se: 'SEAr',
  substitutionelectrophilearomatique: 'SEAr',
  acidebase: 'acide-base',
  acidobasique: 'acide-base',
  ab: 'acide-base',
  protonation: 'acide-base',
  deprotonation: 'acide-base',
  transfertdeproton: 'acide-base',
  oxydoreduction: 'redox',
  oxydation: 'redox',
  reduction: 'redox',
  substitutionnucleophile1: 'SN1',
  substitutionnucleophile2: 'SN2',
  elimination1: 'E1',
  elimination2: 'E2',
  radicalaire: 'radicalaire',
  dielsalder: 'pericyclique',
  transposition: 'transposition',
}

/** The id of a reaction type from any reasonable spelling, or null when it is not one we know. */
export function normalizeReactionType(raw: string): string | null {
  const key = plain(raw)
  if (!key) return null
  const direct = REACTION_TYPES.find((t) => plain(t.id) === key || plain(t.label) === key || plain(t.long) === key)
  return direct?.id ?? ALIASES[key] ?? null
}

export function reactionLabel(id: string): string {
  return REACTION_TYPES.find((t) => t.id === id)?.label ?? id
}

export function reactionLong(id: string): string {
  return REACTION_TYPES.find((t) => t.id === id)?.long ?? id
}

/** Substitution / elimination / addition: the usual suspects, offered as distractors. */
const COMMON = ['SN1', 'SN2', 'E1', 'E2', 'AdN', 'AdE', 'acide-base', 'redox']

/**
 * The chips offered on every step: the types the exercise uses plus the common ones, in the list's order
 * (so the set does not point at the answers).
 */
export function offeredTypes(answers: string[]): ReactionType[] {
  const wanted = new Set([...answers, ...COMMON])
  return REACTION_TYPES.filter((t) => wanted.has(t.id))
}
