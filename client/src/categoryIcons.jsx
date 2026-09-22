import React from 'react';
import {
  Briefcase,
  Laptop,
  TrendingUp,
  Wallet,
  ShoppingCart,
  Home,
  Lightbulb,
  Car,
  UtensilsCrossed,
  Clapperboard,
  Stethoscope,
  Plane,
  ShoppingBag,
  GraduationCap,
  Shield,
  PawPrint,
  Repeat,
  Gift,
  Baby,
  Tag
} from 'lucide-react';

const ICON_RULES = [
  [/salary|paycheck|payroll/i, Briefcase],
  [/freelance|contract/i, Laptop],
  [/invest|dividend|interest/i, TrendingUp],
  [/income/i, Wallet],
  [/grocer/i, ShoppingCart],
  [/rent|mortgage|housing/i, Home],
  [/utilit|electric|water|gas bill|internet|phone/i, Lightbulb],
  [/transport|fuel|car|uber|lyft|parking/i, Car],
  [/dining|restaurant|coffee|food/i, UtensilsCrossed],
  [/entertain|movie|music|game|streaming/i, Clapperboard],
  [/health|medical|doctor|pharmacy|fitness|gym/i, Stethoscope],
  [/travel|flight|hotel|vacation/i, Plane],
  [/shopping|clothes|clothing/i, ShoppingBag],
  [/education|school|tuition|book/i, GraduationCap],
  [/insurance/i, Shield],
  [/pet/i, PawPrint],
  [/subscription/i, Repeat],
  [/gift|donation|charity/i, Gift],
  [/kid|child|baby/i, Baby]
];

export function categoryIconFor(name = '') {
  for (const [pattern, Icon] of ICON_RULES) {
    if (pattern.test(name)) return Icon;
  }
  return Tag;
}

export function CategoryIcon({ name, size = 14, className = 'category-icon' }) {
  const Icon = categoryIconFor(name);
  return (
    <span className={className}>
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}
