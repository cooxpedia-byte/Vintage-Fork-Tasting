import Link from "next/link";

export function Brand({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link className="brand" href={href} aria-label="Vintage Fork Tea Company">
      <span className="brand-mark" aria-hidden="true">VF</span>
      {!compact && <span className="brand-copy"><span className="brand-name">Vintage Fork</span><span className="brand-sub">Tea Company</span></span>}
    </Link>
  );
}
