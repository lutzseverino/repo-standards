import { SearchIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/app/input-group";
import { Kbd } from "@/components/app/kbd";

/** Search over the list. `/` focuses it from anywhere on the page. */
export function Search({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== "/" || target?.closest("input, textarea")) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <InputGroup className="h-10 max-w-md">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        ref={ref}
        type="search"
        placeholder="Search standards sources"
        aria-label="Search standards sources"
        aria-keyshortcuts="/"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-[15px]"
      />
      <InputGroupAddon align="inline-end">
        <Kbd>/</Kbd>
      </InputGroupAddon>
    </InputGroup>
  );
}
