import Image from "next/image";

import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  priority?: boolean;
};

export function BrandMark({ className, priority = false }: BrandMarkProps) {
  return (
    <Image
      src="/brand/vatsim-scandinavia-negative.svg"
      alt="VATSIM Scandinavia"
      width={922}
      height={427}
      priority={priority}
      className={cn("h-auto w-[5.4rem]", className)}
    />
  );
}
