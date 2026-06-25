export function HarpyImageMark({ size }: { readonly size: number }) {
  return (
    <svg
      fill="none"
      height={size}
      viewBox="0 0 102 102"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M16 56 L51 24 L86 56 L86 73 L51 41 L16 73 Z" fill="white" />
      <path d="M30 78 L51 60 L72 78 L72 90 L51 72 L30 90 Z" fill="white" />
    </svg>
  );
}
