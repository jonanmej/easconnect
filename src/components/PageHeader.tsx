import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 mb-7 pb-5 border-b border-border sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1 sm:basis-64">
        <h1 className="text-3xl font-semibold font-display">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto min-w-0 max-w-full sm:justify-end [&>*]:min-w-0 [&>select]:min-w-0 [&>select]:flex-1 sm:[&>select]:flex-none">
          {actions}
        </div>
      ) : null}
    </div>
  );
}