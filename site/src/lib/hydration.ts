// Registers `client:settled` (settled.ts) for the islands that stand alone on
// their page, How it works' and the docs' Support control, so their script
// stays off the critical path.
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";

declare module "astro" {
  interface AstroClientDirectives {
    "client:settled"?: boolean;
  }
}

export function settledHydration(): AstroIntegration {
  return {
    name: "settled-hydration",
    hooks: {
      "astro:config:setup": ({ addClientDirective }) => {
        addClientDirective({
          name: "settled",
          entrypoint: fileURLToPath(new URL("./settled.ts", import.meta.url)),
        });
      },
    },
  };
}
