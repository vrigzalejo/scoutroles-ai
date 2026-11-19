const paths: Record<string, string> = {
  close: "M4 4l8 8M12 4L4 12",
  draft: "M4 2.8h5.2L12.2 5.8V13.2H4zM9.2 2.8V6h2.8M6 8.4h4M6 10.6h2.6",
  spark: "M8 1.8l.9 2.8 2.8.9-2.8.9L8 9.2l-.9-2.8-2.8-.9 2.8-.9zM12.2 10.2l.45 1.2 1.2.45-1.2.45-.45 1.2-.45-1.2-1.2-.45 1.2-.45z",
  copy: "M4 4.2h6.2V11H4zM6.2 6.2h6.2v6.8H6.2z",
  document: "M4 2.6h5.4L12.4 5.6V13.4H4zM9.4 2.6V5.8h3M6 8.2h4.2M6 10.6h3",
  download: "M8 2.6v7.2M5.2 7.2 8 10l2.8-2.8M3.2 12.6h9.6",
  logout: "M6.5 2.8H3.8a1 1 0 0 0-1 1v8.4a1 1 0 0 0 1 1H6.5M6.2 8h6.8M10.6 5.4 13.2 8l-2.6 2.6",
  check: "M3.2 8.2 6.4 11.4 12.8 4.6",
  eye: "M1.8 8S4.2 4.2 8 4.2 14.2 8 14.2 8 11.8 11.8 8 11.8 1.8 8 1.8 8zM8 6.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z",
  upload: "M8 10.6V3.2M5.2 5.8 8 3l2.8 2.8M3.2 12.6h9.6",
  rank: "M2.6 12.8V9h2.3v3.8zM6.8 12.8V4.6h2.3V12.8zM11 12.8V7h2.4v5.8z",
  play: "M5.2 3.4v9.2L12.6 8z",
  refresh: "M13 8A5 5 0 1 1 8.2 3.1M13 3.2v3.2H9.8",
  bookmark: "M4.2 2.8h7.6V13.2L8 10.4l-3.8 2.8z",
  chevron: "M3.5 6.2 8 10.6l4.5-4.4",
  stop: "M4.2 4.2h7.6v7.6H4.2z",
  external: "M6.2 3.4H3.4v9.2h9.2V9.8M8.4 3.4h4.2V7.6M12.4 3.6 7.2 8.8",
  skip: "M3.4 4.2v7.6L9.2 8zM11.2 4.2v7.6",
  arrow: "M3 8h10M9.2 4.2 13 8l-3.8 3.8",
  trash: "M3.4 4.4h9.2M6.2 4.4V3.2h3.6v1.2M4.6 4.4l.6 8.2h5.6l.6-8.2",
  back: "M13 8H3M6.8 4.2 3 8l3.8 3.8",
  pin: "M8 14.2s4.2-3.6 4.2-6.6a4.2 4.2 0 1 0-8.4 0c0 3 4.2 6.6 4.2 6.6zM8 6.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z",
  sample: "M4 2.6h5.2L12.2 5.6V13.4H4zM9.2 2.6V5.8h3M8 8.2l.5 1.2 1.3.2-1 .8.3 1.3L8 11l-1.1.7.3-1.3-1-.8 1.3-.2z",
  clear: "M4 4l8 8M12 4 4 12",
  roles: "M3 4.4h10M3 8h10M3 11.6h6.2",
  tracker: "M3.2 3.4h9.6v9.2H3.2zM5.4 6.4l1.2 1.2 2-2.2M5.4 10.2h5",
};

export function Icon({ name, className = "size-4" }: { name: keyof typeof paths; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
