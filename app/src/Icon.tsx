// 16px 외곽선 아이콘 한 벌 (1.5px 선)
const PATHS = {
  prev: "M10 3.5 5.5 8l4.5 4.5",
  next: "M6 3.5 10.5 8 6 12.5",
  close: "M4 4l8 8M12 4l-8 8",
} as const;

export function Icon({ name }: { name: keyof typeof PATHS | "more" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {name === "more" ? (
        <g fill="currentColor">
          <circle cx="3.5" cy="8" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="12.5" cy="8" r="1.25" />
        </g>
      ) : (
        <path d={PATHS[name]} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
