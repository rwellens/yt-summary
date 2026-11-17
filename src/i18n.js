// All user-facing text lives here: UI strings (English / French) and the section
// headings and verdict labels used in generated summaries (one set per output language).

export const UI_LANGUAGES = { en: 'English', fr: 'Français' };

const UI = {
  en: {
    brand: 'Summary',
    settings: 'Settings',
    uiLang: 'Interface language',
    model: 'Summary model',
    badgeModel: 'Thumbnail model',
    badgeModelHint: 'Use a small, fast model: it analyses many videos in a row.',
    sameAsSummary: 'Same as summary',
    badgeModelLocalOnly: 'Thumbnails need a local model: pick one in “Thumbnail model” (subscription models are for summaries only).',
    cache: 'Cache',
    clearVerdicts: 'Re-analyse thumbnails',
    clearSummaries: 'Clear saved summaries',
    clearedVerdicts_one: '{n} thumbnail verdict cleared: visible thumbnails are being analysed again.',
    clearedVerdicts_other: '{n} thumbnail verdicts cleared: visible thumbnails are being analysed again.',
    clearedSummaries_one: '{n} summary cleared.',
    clearedSummaries_other: '{n} summaries cleared.',
    reloadModels: 'Reload the list',
    summaryLang: 'Summary language',
    length: 'Length',
    short: 'Short',
    long: 'Detailed',
    badges: 'Verdict on YouTube thumbnails',
    badgesHint: 'Automatic analysis of visible videos',
    interests: 'What I care about (for the verdict)',
    interestsPlaceholder: 'e.g. web development, local AI, electric cars. No vlogs.',
    server: 'Summary server (Ollama)',
    badgeServer: 'Thumbnail server (Ollama)',
    sameServer: 'Same as summary',
    empty: 'Open a YouTube video, then come back here.',
    summarize: 'Summarize the video',
    regenerate: 'Regenerate',
    retry: 'Try again',
    stop: 'Stop',
    copy: 'Copy',
    copied: 'Copied ✓',
    modelsAvailable_one: '1 model available.',
    modelsAvailable_other: '{n} models available.',
    noModels: 'No model installed. e.g. ollama pull gemma4:e4b',
    ollamaUnreachable: 'Ollama is unreachable at {base}. Start "ollama serve" (or the Ollama app).',
    ollama403: 'Ollama rejected the request (403). Reload the extension to reinstall the CORS rule.',
    noModelChosen: 'Ollama: no model selected in the settings.',
    pickModel: 'Pick an Ollama model in the settings.',
    cannotReadPage: 'Cannot read the page. Reload the YouTube tab.',
    NO_VIDEO: 'No video detected on this page.',
    NO_TRANSCRIPT: 'This video has no captions or transcript available.',
    fetchingTranscript: 'Fetching the transcript…',
    transcriptReady: 'Transcript: {n} segments. Analysis by {model}…',
    readingPart: 'Reading part {i}/{n}…',
    writing: 'Writing the summary…',
    analysing: 'Analysing…',
    analysingTitle: 'YT Summary is analysing this video with Ollama',
    statusTriage: 'Sorting {n} titles…',
    statusVerdict: 'Analysing “{title}”',
    statusQueue: '+{n} waiting',
    watch: 'Worth watching',
    skim: 'Skim it',
    skip: 'Summary is enough',
    off: 'Not relevant',
  },
  fr: {
    brand: 'Résumé',
    settings: 'Réglages',
    uiLang: "Langue de l'interface",
    model: 'Modèle du résumé',
    badgeModel: 'Modèle des vignettes',
    badgeModelHint: 'Choisis un petit modèle rapide : il analyse beaucoup de vidéos à la suite.',
    sameAsSummary: 'Identique au résumé',
    badgeModelLocalOnly: 'Les vignettes demandent un modèle local : choisis-en un dans « Modèle des vignettes » (les modèles d\u2019abonnement sont réservés aux résumés).',
    cache: 'Cache',
    clearVerdicts: 'Réanalyser les vignettes',
    clearSummaries: 'Effacer les résumés enregistrés',
    clearedVerdicts_one: '{n} verdict de vignette effacé : les vignettes visibles sont réanalysées.',
    clearedVerdicts_other: '{n} verdicts de vignettes effacés : les vignettes visibles sont réanalysées.',
    clearedSummaries_one: '{n} résumé effacé.',
    clearedSummaries_other: '{n} résumés effacés.',
    reloadModels: 'Recharger la liste',
    summaryLang: 'Langue du résumé',
    length: 'Longueur',
    short: 'Court',
    long: 'Détaillé',
    badges: 'Verdict sur les vignettes YouTube',
    badgesHint: 'Analyse automatique des vidéos visibles',
    interests: "Ce qui m'intéresse (pour le verdict)",
    interestsPlaceholder: 'Ex. : développement web, IA locale, voitures électriques. Pas de vlogs.',
    server: 'Serveur du résumé (Ollama)',
    badgeServer: 'Serveur des vignettes (Ollama)',
    sameServer: 'Identique au résumé',
    empty: 'Ouvre une vidéo YouTube, puis reviens ici.',
    summarize: 'Résumer la vidéo',
    regenerate: 'Régénérer',
    retry: 'Réessayer',
    stop: 'Arrêter',
    copy: 'Copier',
    copied: 'Copié ✓',
    modelsAvailable_one: '1 modèle disponible.',
    modelsAvailable_other: '{n} modèles disponibles.',
    noModels: 'Aucun modèle installé. Ex. : ollama pull gemma4:e4b',
    ollamaUnreachable: 'Ollama est injoignable sur {base}. Lance « ollama serve » (ou l’app Ollama).',
    ollama403: 'Ollama refuse la requête (403). Recharge l’extension pour réinstaller la règle CORS.',
    noModelChosen: 'Ollama : aucun modèle choisi dans les réglages.',
    pickModel: 'Choisis un modèle Ollama dans les réglages.',
    cannotReadPage: 'Impossible de lire la page. Recharge l’onglet YouTube.',
    NO_VIDEO: 'Aucune vidéo détectée sur cette page.',
    NO_TRANSCRIPT: 'Cette vidéo n’a pas de sous-titres ni de transcription disponibles.',
    fetchingTranscript: 'Récupération de la transcription…',
    transcriptReady: 'Transcription : {n} segments. Analyse par {model}…',
    readingPart: 'Lecture de la partie {i}/{n}…',
    writing: 'Rédaction du résumé…',
    analysing: 'Analyse…',
    analysingTitle: 'YT Summary analyse cette vidéo avec Ollama',
    statusTriage: 'Tri de {n} titres…',
    statusVerdict: 'Analyse de « {title} »',
    statusQueue: '+{n} en attente',
    watch: 'À regarder',
    skim: 'En accéléré',
    skip: 'Résumé suffit',
    off: 'Non pertinent',
  },
};

// Output languages for summaries: name given to the model, UI label, fixed headings and
// verdict labels (fixed rather than left to the model, which tends not to translate them).
export const OUTPUT_LANGUAGES = {
  fr: {
    name: 'French',
    label: 'Français',
    headings: { verdict: 'Verdict', conclusion: 'Conclusion', takeaways: "L'important", outline: 'Déroulé' },
    verdicts: { watch: 'À regarder', skim: 'En accéléré', skip: 'Le résumé suffit', off: 'Non pertinent' },
  },
  en: {
    name: 'English',
    label: 'English',
    headings: { verdict: 'Verdict', conclusion: 'Conclusion', takeaways: 'Key takeaways', outline: 'Outline' },
    verdicts: { watch: 'Worth watching', skim: 'Skim it', skip: 'Summary is enough', off: 'Not relevant' },
  },
  nl: {
    name: 'Dutch',
    label: 'Nederlands',
    headings: { verdict: 'Oordeel', conclusion: 'Conclusie', takeaways: 'Belangrijkste punten', outline: 'Verloop' },
    verdicts: { watch: 'Bekijken', skim: 'Snel doorspoelen', skip: 'Samenvatting volstaat', off: 'Niet relevant' },
  },
  de: {
    name: 'German',
    label: 'Deutsch',
    headings: { verdict: 'Urteil', conclusion: 'Fazit', takeaways: 'Das Wichtigste', outline: 'Ablauf' },
    verdicts: { watch: 'Ansehen', skim: 'Überfliegen', skip: 'Zusammenfassung reicht', off: 'Nicht relevant' },
  },
  es: {
    name: 'Spanish',
    label: 'Español',
    headings: { verdict: 'Veredicto', conclusion: 'Conclusión', takeaways: 'Lo importante', outline: 'Desarrollo' },
    verdicts: { watch: 'Merece la pena', skim: 'A saltos', skip: 'Basta con el resumen', off: 'No relevante' },
  },
};

export const outputLanguage = (lang) => OUTPUT_LANGUAGES[lang] || OUTPUT_LANGUAGES.en;

// ------------------------------------------------------------------ UI translation

let locale = 'en';

export function defaultUiLang() {
  return (globalThis.navigator?.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function setLocale(lang) {
  locale = UI[lang] ? lang : 'en';
}

export function getLocale() {
  return locale;
}

/** Translates a key, filling {placeholders}; `n` selects the _one / _other plural form. */
export function t(key, vars = {}) {
  const dict = UI[locale];
  const plural = 'n' in vars ? `${key}_${vars.n === 1 ? 'one' : 'other'}` : null;
  const str = (plural && dict[plural]) ?? dict[key] ?? UI.en[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/** Labels needed by the content script (which cannot import modules). */
export function badgeLabels() {
  const keys = ['watch', 'skim', 'skip', 'off', 'analysing', 'analysingTitle', 'statusTriage', 'statusVerdict', 'statusQueue'];
  // Placeholders are kept as-is: the content script fills them in.
  const keep = { n: '{n}', title: '{title}' };
  return Object.fromEntries(keys.map((k) => [k, k.startsWith('status') ? UI[locale][k] ?? UI.en[k] : t(k, keep)]));
}

/** Applies translations to elements carrying data-i18n / data-i18n-title / data-i18n-placeholder. */
export function applyI18n(root = document) {
  root.documentElement.lang = locale;
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle)));
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
}
