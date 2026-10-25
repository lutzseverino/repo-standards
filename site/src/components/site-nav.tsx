// The nav of a page other than the homepage: the way home, the
// documentation, the repository, the Support control and the theme toggle.
import { buttonVariants } from "@/components/app/button";
import { useTheme } from "@/lib/theme";
import { SupportMenu } from "./support";
import { ThemeToggle } from "./theme-toggle";

export const REPOSITORY = "https://github.com/lutzseverino/repo-standards";

export function SiteNav() {
  const [theme, setTheme] = useTheme();
  return (
    <nav className="mb-8 flex flex-wrap items-center justify-between gap-1 text-[15px]">
      <a className={buttonVariants({ variant: "ghost" })} href="/">
        All standards sources
      </a>
      <div className="flex items-center gap-1">
        <a className={buttonVariants({ variant: "ghost" })} href="/docs/">
          Documentation
        </a>
        <a className={buttonVariants({ variant: "ghost" })} href={REPOSITORY}>
          GitHub
        </a>
        <SupportMenu />
        <ThemeToggle theme={theme} onChange={setTheme} />
      </div>
    </nav>
  );
}
