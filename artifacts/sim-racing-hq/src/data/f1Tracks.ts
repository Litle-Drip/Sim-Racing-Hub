export interface F1Track {
  id: string;
  name: string;
  short: string;
  country: string;
  flag: string;
  corners: number;
}

export const F1_TRACKS: F1Track[] = [
  { id: 'bahrain', name: 'Bahrain International Circuit', short: 'Bahrain', country: 'Bahrain', flag: '🇧🇭', corners: 15 },
  { id: 'jeddah', name: 'Jeddah Corniche Circuit', short: 'Saudi Arabia', country: 'Saudi Arabia', flag: '🇸🇦', corners: 27 },
  { id: 'albert_park', name: 'Albert Park Circuit', short: 'Australia', country: 'Australia', flag: '🇦🇺', corners: 16 },
  { id: 'suzuka', name: 'Suzuka Circuit', short: 'Japan', country: 'Japan', flag: '🇯🇵', corners: 18 },
  { id: 'shanghai', name: 'Shanghai International Circuit', short: 'China', country: 'China', flag: '🇨🇳', corners: 16 },
  { id: 'miami', name: 'Miami International Autodrome', short: 'Miami', country: 'USA', flag: '🇺🇸', corners: 19 },
  { id: 'imola', name: 'Autodromo Enzo e Dino Ferrari', short: 'Imola', country: 'Italy', flag: '🇮🇹', corners: 19 },
  { id: 'monaco', name: 'Circuit de Monaco', short: 'Monaco', country: 'Monaco', flag: '🇲🇨', corners: 19 },
  { id: 'barcelona', name: 'Circuit de Barcelona-Catalunya', short: 'Barcelona', country: 'Spain', flag: '🇪🇸', corners: 16 },
  { id: 'montreal', name: 'Circuit Gilles Villeneuve', short: 'Canada', country: 'Canada', flag: '🇨🇦', corners: 14 },
  { id: 'red_bull_ring', name: 'Red Bull Ring', short: 'Austria', country: 'Austria', flag: '🇦🇹', corners: 10 },
  { id: 'silverstone', name: 'Silverstone Circuit', short: 'Silverstone', country: 'UK', flag: '🇬🇧', corners: 18 },
  { id: 'hungaroring', name: 'Hungaroring', short: 'Hungary', country: 'Hungary', flag: '🇭🇺', corners: 14 },
  { id: 'spa', name: 'Circuit de Spa-Francorchamps', short: 'Spa', country: 'Belgium', flag: '🇧🇪', corners: 19 },
  { id: 'zandvoort', name: 'Circuit Zandvoort', short: 'Zandvoort', country: 'Netherlands', flag: '🇳🇱', corners: 14 },
  { id: 'monza', name: 'Autodromo Nazionale Monza', short: 'Monza', country: 'Italy', flag: '🇮🇹', corners: 11 },
  { id: 'baku', name: 'Baku City Circuit', short: 'Baku', country: 'Azerbaijan', flag: '🇦🇿', corners: 20 },
  { id: 'marina_bay', name: 'Marina Bay Street Circuit', short: 'Singapore', country: 'Singapore', flag: '🇸🇬', corners: 19 },
  { id: 'cota', name: 'Circuit of the Americas', short: 'COTA', country: 'USA', flag: '🇺🇸', corners: 20 },
  { id: 'rodriguez', name: 'Autodromo Hermanos Rodriguez', short: 'Mexico City', country: 'Mexico', flag: '🇲🇽', corners: 17 },
  { id: 'interlagos', name: 'Autodromo Jose Carlos Pace', short: 'Interlagos', country: 'Brazil', flag: '🇧🇷', corners: 15 },
  { id: 'las_vegas', name: 'Las Vegas Strip Circuit', short: 'Las Vegas', country: 'USA', flag: '🇺🇸', corners: 17 },
  { id: 'losail', name: 'Losail International Circuit', short: 'Qatar', country: 'Qatar', flag: '🇶🇦', corners: 16 },
  { id: 'yas_marina', name: 'Yas Marina Circuit', short: 'Abu Dhabi', country: 'UAE', flag: '🇦🇪', corners: 16 },
];

export const TIRE_COMPOUNDS = ['Soft', 'Medium', 'Hard', 'Inter', 'Wet'];
export const SESSION_TYPES = ['Practice', 'Qualifying', 'Race', 'Hotlap'];
export const CONDITIONS = ['Dry', 'Damp', 'Wet'];
export const ASSISTS = ['None', 'Partial', 'Full'];
export const SETUP_TAGS = ['Qualifying', 'Race', 'Wet', 'Test', 'Sprint'];
export const PLATFORMS = ['PC', 'PlayStation', 'Xbox'];
export const INPUT_DEVICES = ['Wheel', 'Controller'];

export const F1_25_CARS = [
  'Red Bull RB21',
  'McLaren MCL39',
  'Ferrari SF-25',
  'Mercedes W16',
  'Aston Martin AMR25',
  'Alpine A525',
  'Haas VF-25',
  'RB VCARB 02',
  'Williams FW47',
  'Sauber C45',
];
