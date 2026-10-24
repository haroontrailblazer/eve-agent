import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The named type sizes and the raised shadow come from the tokens in
// app/globals.css. Without them tailwind-merge reads `text-body` as a color
// and keeps it next to `text-sm`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "title", "heading", "body", "small", "meta"],
      shadow: ["raised"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
