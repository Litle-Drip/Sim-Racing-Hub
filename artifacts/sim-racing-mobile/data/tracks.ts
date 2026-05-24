export interface F1Track {
  id: string;
  name: string;
  short: string;
  country: string;
  corners: number;
}

export const F1_TRACKS: F1Track[] = [
  { id: "bahrain", name: "Bahrain International Circuit", short: "Bahrain", country: "BH", corners: 15 },
  { id: "jeddah", name: "Jeddah Corniche Circuit", short: "Saudi Arabia", country: "SA", corners: 27 },
  { id: "albert_park", name: "Albert Park Circuit", short: "Australia", country: "AU", corners: 16 },
  { id: "suzuka", name: "Suzuka Circuit", short: "Japan", country: "JP", corners: 18 },
  { id: "shanghai", name: "Shanghai International Circuit", short: "China", country: "CN", corners: 16 },
  { id: "miami", name: "Miami International Autodrome", short: "Miami", country: "US", corners: 19 },
  { id: "imola", name: "Autodromo Enzo e Dino Ferrari", short: "Imola", country: "IT", corners: 19 },
  { id: "monaco", name: "Circuit de Monaco", short: "Monaco", country: "MC", corners: 19 },
  { id: "barcelona", name: "Circuit de Barcelona-Catalunya", short: "Barcelona", country: "ES", corners: 16 },
  { id: "montreal", name: "Circuit Gilles Villeneuve", short: "Canada", country: "CA", corners: 14 },
  { id: "red_bull_ring", name: "Red Bull Ring", short: "Austria", country: "AT", corners: 10 },
  { id: "silverstone", name: "Silverstone Circuit", short: "Silverstone", country: "GB", corners: 18 },
  { id: "hungaroring", name: "Hungaroring", short: "Hungary", country: "HU", corners: 14 },
  { id: "spa", name: "Circuit de Spa-Francorchamps", short: "Spa", country: "BE", corners: 19 },
  { id: "zandvoort", name: "Circuit Zandvoort", short: "Zandvoort", country: "NL", corners: 14 },
  { id: "monza", name: "Autodromo Nazionale Monza", short: "Monza", country: "IT", corners: 11 },
  { id: "baku", name: "Baku City Circuit", short: "Baku", country: "AZ", corners: 20 },
  { id: "marina_bay", name: "Marina Bay Street Circuit", short: "Singapore", country: "SG", corners: 19 },
  { id: "cota", name: "Circuit of the Americas", short: "COTA", country: "US", corners: 20 },
  { id: "rodriguez", name: "Autodromo Hermanos Rodriguez", short: "Mexico City", country: "MX", corners: 17 },
  { id: "interlagos", name: "Autodromo Jose Carlos Pace", short: "Interlagos", country: "BR", corners: 15 },
  { id: "las_vegas", name: "Las Vegas Strip Circuit", short: "Las Vegas", country: "US", corners: 17 },
  { id: "losail", name: "Losail International Circuit", short: "Qatar", country: "QA", corners: 16 },
  { id: "yas_marina", name: "Yas Marina Circuit", short: "Abu Dhabi", country: "AE", corners: 16 },
];

export const TIRE_COMPOUNDS = ["Soft", "Medium", "Hard", "Inter", "Wet"] as const;
export const SESSION_TYPES = ["Practice", "Qualifying", "Race", "Hotlap"] as const;
export const CONDITIONS = ["Dry", "Damp", "Wet"] as const;
export const ASSISTS = ["None", "Partial", "Full"] as const;
export const PLATFORMS = ["PC", "PlayStation", "Xbox"] as const;
export const INPUT_DEVICES = ["Wheel", "Controller"] as const;

export function getTrackById(id: string): F1Track | undefined {
  return F1_TRACKS.find((t) => t.id === id);
}
