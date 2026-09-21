function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BANNED = [
  'nigger',
  'nigga',
  'faggot',
  'kike',
  'spic',
  'retard',
  'rape',
  'rapist',
  'child porn',
  'childporn',
  'csam',
  'loli',
];

export function findBannedPhrase(text: string): string | null {
  const normalized = text.toLowerCase();
  for (const phrase of BANNED) {
    if (phrase.includes(' ')) {
      if (normalized.includes(phrase)) return phrase;
      continue;
    }
    const re = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i');
    if (re.test(text)) return phrase;
  }
  return null;
}

export function assertCleanText(text: string, label = 'Text') {
  if (findBannedPhrase(text)) {
    throw new Error(`${label} contains language we don’t allow.`);
  }
}
