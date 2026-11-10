import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="border-b bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground" {...props} />;
}
export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="divide-y" {...props} />;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-secondary/40", className)} {...props} />;
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("h-10 px-3 font-medium whitespace-nowrap", className)} {...props} />;
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 align-middle", className)} {...props} />;
}

/** Column header that toggles sorting; exposes aria-sort for assistive tech. */
export function SortTH<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: K;
  sort: { key: K; dir: "asc" | "desc" };
  onSort: (key: K) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("h-10 px-3 font-medium", className)}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground">
        {label}
        <Icon className="size-3" aria-hidden />
      </button>
    </th>
  );
}

export function useSort<K extends string>(initial: K, dir: "asc" | "desc" = "asc") {
  const [sort, setSort] = React.useState<{ key: K; dir: "asc" | "desc" }>({ key: initial, dir });
  const onSort = (key: K) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  return { sort, onSort };
}

export function Pagination({ page, pageCount, onPage, total, label = "items" }: { page: number; pageCount: number; onPage: (p: number) => void; total: number; label?: string }) {
  if (pageCount <= 1) return <p className="px-1 pt-3 text-xs text-muted-foreground">{total} {label}</p>;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 px-1 pt-3 text-xs text-muted-foreground">
      <span>
        {total} {label} · page {page + 1} of {pageCount}
      </span>
      <span className="flex gap-1">
        <button type="button" className="rounded-md border px-2 py-1 hover:bg-secondary disabled:opacity-40" disabled={page === 0} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button type="button" className="rounded-md border px-2 py-1 hover:bg-secondary disabled:opacity-40" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </span>
    </nav>
  );
}

export function usePaged<T>(items: T[], pageSize = 50) {
  const [page, setPage] = React.useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safe = Math.min(page, pageCount - 1);
  return { page: safe, pageCount, setPage, slice: items.slice(safe * pageSize, safe * pageSize + pageSize) };
}
