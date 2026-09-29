// Small line icons so each kind of step is recognizable at a glance.
const P: Record<string, string> = {
  pin: "M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  doc: "M7 3h7l4 4v14H7zM14 3v4h4M9.5 12h6M9.5 15.5h6",
  money: "M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6 10v4M18 10v4",
  building: "M4 21V5l8-2v18M12 8h8v13M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2M3 21h18",
  hammer: "M14 6l4 4-2 2-4-4zM12 8l-8 8 2 2 8-8M17 3l4 4",
  food: "M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M16 21V3c2 1 3 4 3 7h-3",
  glass: "M8 3h8l-1 7a3 3 0 0 1-6 0zM12 13v7M9 21h6",
  sign: "M4 5h16v8H4zM12 13v8M8 21h8M7.5 9h9",
  check: "M12 3l2.5 2 3-.3.8 3 2.6 1.6-1.2 2.8 1.2 2.8-2.6 1.6-.8 3-3-.3L12 21l-2.5-2-3 .3-.8-3-2.6-1.6L4.3 12 3.1 9.2l2.6-1.6.8-3 3 .3zM8.5 12l2.5 2.5 4.5-5",
  table: "M4 10h16M6 10v9M18 10v9M8 10V6h8v4",
  cert: "M5 4h14v11H5zM9 15l-1 6 4-2 4 2-1-6M8.5 8h7M8.5 11h4",
};
export function iconFor(id: string): keyof typeof P {
  if (/zoning/.test(id)) return "pin";
  if (/alcohol|abc_/.test(id)) return "glass";
  if (/sign_permit/.test(id)) return "sign";
  if (/final_inspection/.test(id)) return "check";
  if (/building_permit|placeholder|fire/.test(id)) return "building";
  if (/^work_/.test(id)) return "hammer";
  if (/food_manager/.test(id)) return "cert";
  if (/^deh_/.test(id)) return "food";
  if (/sidewalk|encroach/.test(id)) return "table";
  if (/ein|cdtfa|edd|business_tax|business_license/.test(id)) return "money";
  return "doc";
}
export default function StepIcon({ id, className = "" }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={P[iconFor(id)]} />
    </svg>
  );
}
