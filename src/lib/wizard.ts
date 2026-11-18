/*
 * La prueba del mago.
 * Para añadir o cambiar preguntas, edita esta lista. `last: true` hace que esa
 * pregunta salga siempre la última; el resto se barajan cada vez.
 */

export interface WizardQuestion {
  word: string
  answer: boolean // true = Sí, es pensaukas
  last?: boolean
}

export const WIZARD_PROMPT = '¿Es pensaukas?'

export const WIZARD_QUESTIONS: WizardQuestion[] = [
  { word: 'Apolo', answer: true },
  { word: 'El mago', answer: false },
  { word: 'Grd', answer: false },
  { word: 'Zekku', answer: true },
  { word: 'Kastor', answer: false },
  { word: 'Xino', answer: false },
  { word: 'Patxi', answer: false },
  { word: 'CBS', answer: false },
  { word: 'La caverna del mago', answer: false },
  { word: 'El studio de ezzey', answer: true },
  { word: 'La xinos room', answer: false },
  { word: 'La panic room', answer: false },
  { word: 'La hermita', answer: false, last: true },
]

/** Baraja las preguntas (Fisher–Yates) y deja las marcadas como `last` al final. */
export function buildQuiz(questions = WIZARD_QUESTIONS): WizardQuestion[] {
  const rest = questions.filter((q) => !q.last)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [...rest, ...questions.filter((q) => q.last)]
}
