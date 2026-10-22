import { buttonVariants } from "@/components/app/button";

export function RepositoryLink() {
  return (
    <a
      className={buttonVariants()}
      href="https://github.com/lutzseverino/repo-standards"
    >
      View on GitHub
    </a>
  );
}
