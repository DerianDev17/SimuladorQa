const paths = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  transaction: 'M4 7h16m-4-4 4 4-4 4 M20 17H4m4-4-4 4 4 4',
  atm: 'M5 3h14v18H5z M8 6h8v6H8z M8 16h8 M8 19h3',
  card: 'M3 5h18v14H3z M3 9h18 M6 15h4',
  load: 'M3 17 8 12l4 3 8-11 M15 4h5v5',
  monitor: 'M3 4h18v13H3z M8 21h8 M12 17v4 M5 11h3l2-4 4 7 2-3h3',
  history: 'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2',
  settings:
    'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z M8 12l3 3 5-6',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
  check: 'M5 12l4 4L19 6',
  reader: 'M5 3h14v18H5z M8 6h8 M8 9h8 M10 15h4 M11 18h2',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
