import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 mb-8 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0 max-w-full sm:justify-end [&>select]:min-w-0 [&>select]:flex-1 sm:[&>select]:flex-none">
          {actions}
        </div>
      ) : null}
    </div>
  );
}