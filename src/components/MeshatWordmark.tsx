interface MeshatWordmarkProps {
  className?: string;
}

export function MeshatWordmark({ className }: MeshatWordmarkProps) {
  return (
    <span className={`inline-flex h-7 items-center ${className ?? ""}`}>
      <img
        src="/meshat-logo.svg"
        alt="Meshat.se"
        className="block h-full w-auto max-w-full object-contain object-left"
      />
    </span>
  );
}
