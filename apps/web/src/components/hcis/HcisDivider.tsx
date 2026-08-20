export function HcisDivider({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-brand-primary/20 to-brand-primary/5" />
      <span className="text-xs text-muted-foreground">{text}</span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-brand-primary/20 to-brand-primary/5" />
    </div>
  );
}
