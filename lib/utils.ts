// lib/utils.ts
import { clsx } from "clsx";

/** Об’єднує класи Tailwind/звичайні класи */
export function cn(...inputs: Array<string | false | null | undefined>) {
  return clsx(...inputs);
}
