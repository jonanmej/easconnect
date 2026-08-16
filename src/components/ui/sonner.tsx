import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      /* En móvil los avisos van centrados arriba, por debajo de la isla
         dinámica / notch, y con ancho seguro respecto a los bordes. */
      mobileOffset={{
        top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
        left: "max(env(safe-area-inset-left, 0px), 0.75rem)",
        right: "max(env(safe-area-inset-right, 0px), 0.75rem)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
      }}
      offset={{
        top: "calc(env(safe-area-inset-top, 0px) + 1rem)",
        right: "max(env(safe-area-inset-right, 0px), 1rem)",
        left: "max(env(safe-area-inset-left, 0px), 1rem)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:w-full",
          title: "group-[.toast]:text-[0.9375rem] group-[.toast]:leading-snug",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:break-words",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
