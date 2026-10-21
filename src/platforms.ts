import {
  detectPlatform,
  PlatformError,
  type PlatformName,
} from "@lutzseverino/postern";
import { git } from "./observation.js";

// The hosting platforms this CLI supports, by Postern's platform name. Postern
// exports no runtime list of the platforms it serves, so this constant is the
// product's own: a Postern major that widens PlatformName changes nothing here
// until a platform is added. It is the one seam through which tests supply a
// second platform to the installed CLI.
export const supportedPlatforms: PlatformName[] = ["github"];

// The platform of a profile that declares none, which every source written
// before platforms existed, and every recorded selection without one, uses.
export const defaultPlatform: PlatformName = "github";

// A declaration applies on the selected platform when it names none, or that
// one. Platform filtering comes before scope.
export function onPlatform<Declaration extends { platform?: string }>(
  declarations: readonly Declaration[],
  platform: string,
): Declaration[] {
  return declarations.filter(
    (declaration) =>
      declaration.platform === undefined || declaration.platform === platform,
  );
}

// The platform the project's origin remote is hosted on, or why none is
// known: no origin remote, or a remote no Postern adapter serves.
export type DetectedPlatform =
  | { platform: string }
  | { reason: "no-remote" | "unsupported"; message: string };

export function detectProjectPlatform(root: string): DetectedPlatform {
  const remote = git(root, ["remote", "get-url", "origin"]);
  const url = remote.status === 0 ? remote.stdout.trim() : "";
  if (!url)
    return {
      reason: "no-remote",
      message: "The project has no origin remote.",
    };
  try {
    return { platform: detectPlatform(url).platform };
  } catch (error) {
    if (error instanceof PlatformError && error.reason === "unsupported")
      return {
        reason: "unsupported",
        message: "No supported hosting platform serves the origin remote.",
      };
    throw error;
  }
}
