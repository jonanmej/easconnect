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
    <div className="flex flex-col gap-4 mb-8 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto [&>select]:min-w-0 [&>select]:flex-1 lg:[&>select]:flex-none">
          {actions}
        </div>
      ) : null}
    </div>
  );
}