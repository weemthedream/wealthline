const ICON_RULES = [
  [/salary|paycheck|payroll/i, '💼'],
  [/freelance|contract/i, '🧑‍💻'],
  [/invest|dividend|interest/i, '📈'],
  [/income/i, '💰'],
  [/grocer/i, '🛒'],
  [/rent|mortgage|housing/i, '🏠'],
  [/utilit|electric|water|gas|internet|phone/i, '💡'],
  [/transport|gas station|fuel|car|uber|lyft|parking/i, '🚗'],
  [/dining|restaurant|coffee|food/i, '🍽️'],
  [/entertain|movie|music|game|streaming/i, '🎬'],
  [/health|medical|doctor|pharmacy|fitness|gym/i, '🩺'],
  [/travel|flight|hotel|vacation/i, '✈️'],
  [/shopping|clothes|clothing/i, '🛍️'],
  [/education|school|tuition|book/i, '🎓'],
  [/insurance/i, '🛡️'],
  [/pet/i, '🐾'],
  [/subscription/i, '🔁'],
  [/gift|donation|charity/i, '🎁'],
  [/kid|child|baby/i, '🧸']
];

export function iconForCategory(name = '') {
  for (const [pattern, icon] of ICON_RULES) {
    if (pattern.test(name)) return icon;
  }
  return '🏷️';
}
