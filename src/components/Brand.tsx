import Image from "next/image";
import Link from "next/link";
import { BRAND_ASSETS } from "@/lib/brand";

export function Brand({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link className="brand" href={href} aria-label="Vintage Fork Tea Company">
      <span className="brand-mark" aria-hidden="true">
        <Image
          alt=""
          height={BRAND_ASSETS.logo.height}
          src={BRAND_ASSETS.logo.src}
          width={BRAND_ASSETS.logo.width}
        />
      </span>
      {!compact && <span className="brand-copy"><span className="brand-name">Vintage Fork</span><span className="brand-sub">Tea Company</span></span>}
    </Link>
  );
}
