import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // next-env.d.ts is Next's own auto-generated, "do not edit" file — its
    // triple-slash reference to .next/types is Next's doing, not ours.
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
];

export default config;
