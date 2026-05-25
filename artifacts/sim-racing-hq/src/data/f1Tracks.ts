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
export const CONDITIONS = ['Dry', 'Damp', 'Wet', 'Light Rain', 'Heavy Rain', 'Storm'];
export const TIME_OF_DAY = ['Morning', 'Midday', 'Afternoon', 'Evening', 'Night'];
export const ASSISTS = ['None', 'Partial', 'Full'];
export const SETUP_TAGS = ['Qualifying', 'Race', 'Wet', 'Test', 'Sprint'];
export const PLATFORMS = ['PC', 'PlayStation', 'Xbox'];
export const INPUT_DEVICES = ['Wheel', 'Controller'];

/** Pre-populated corner names for each circuit (index 0 = Turn 1). */
export const CORNER_NAMES: Record<string, string[]> = {
  bahrain: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turn 10', 'Turn 11', 'Turn 12', 'Turn 13', 'Turn 14', 'Turn 15'],
  jeddah: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turn 10', 'Turn 11', 'Turn 12', 'Turn 13', 'Turn 14', 'Turn 15', 'Turn 16', 'Turn 17', 'Turn 18', 'Turn 19', 'Turn 20', 'Turn 21', 'Turn 22', 'Turn 23', 'Turn 24', 'Turn 25', 'Turn 26', 'Turn 27'],
  albert_park: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turn 10', 'Turn 11', 'Turn 12', 'Turn 13', 'Turn 14', 'Turn 15', 'Turn 16'],
  suzuka: ['Turn 1', 'Turn 2', 'Degner 1', 'Degner 2', 'Hairpin', 'Turn 6', '200R', 'Dunlop', 'Turn 9', 'Turn 10', 'Turn 11', 'Spoon 1', 'Spoon 2', '130R', 'Casio Triangle 1', 'Casio Triangle 2', 'Turn 17', 'Turn 18'],
  shanghai: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turn 10', 'Turn 11', 'Turn 12', 'Turn 13', 'Hairpin', 'Turn 15', 'Turn 16'],
  miami: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turn 10', 'Turn 11', 'Turn 12', 'Turn 13', 'Turn 14', 'Turn 15', 'Turn 16', 'Turn 17', 'Turn 18', 'Turn 19'],
  imola: ['Tamburello', 'Tamburello 2', 'Villeneuve', 'Tosa', 'Piratella', 'Acque Minerali 1', 'Acque Minerali 2', 'Turn 8', 'Turn 9', 'Turn 10', 'Turn 11', 'Variante Alta 1', 'Variante Alta 2', 'Rivazza 1', 'Rivazza 2', 'Turn 16', 'Turn 17', 'Turn 18', 'Turn 19'],
  monaco: ['Sainte Devote', 'Beau Rivage', 'Massenet', 'Casino', 'Mirabeau Haute', 'Mirabeau Bas', 'Portier', 'Tunnel Entry', 'Tunnel Exit', 'Nouvelle Chicane 1', 'Nouvelle Chicane 2', 'Tabac', 'Turn 13', 'Swimming Pool 1', 'Swimming Pool 2', 'La Rascasse', 'Anthony Noghes', 'Turn 18', 'Turn 19'],
  barcelona: ['Elf', 'Turn 2', 'Turn 3', 'Turn 4', 'Seat', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'La Caixa', 'Turn 11', 'Turn 12', 'Turn 13', 'Turn 14', 'New Chicane 1', 'New Chicane 2'],
  montreal: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turn 10', 'Turn 11', 'Turn 12', 'Turn 13', 'Wall of Champions'],
  red_bull_ring: ['Turn 1', 'Turn 2 Remus', 'Turn 3 Schlossgold', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9 Rindt', 'Turn 10'],
  silverstone: ['Abbey', 'Farm', 'Village', 'The Loop', 'Aintree', 'Turn 6', 'Luffield', 'Woodcote', 'Copse', 'Maggots', 'Becketts', 'Chapel', 'Turn 13', 'Stowe', 'Vale', 'Club', 'Turn 17', 'Turn 18'],
  hungaroring: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turn 10', 'Turn 11', 'Turn 12', 'Turn 13', 'Turn 14'],
  spa: ['La Source', 'Eau Rouge', 'Raidillon', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Pouhon 1', 'Pouhon 2', 'Fagnes', 'Campus', 'Stavelot', 'Turn 15', 'Blanchimont', 'Bus Stop 1', 'Bus Stop 2', 'Turn 19'],
  zandvoort: ['Tarzanbocht', 'Gerlachbocht', 'Hugenholtz', 'Hunzerug', 'Turn 5', 'Turn 6', 'Scheivlak', 'Mastersbocht', 'Turn 9', 'Turn 10', 'Turn 11', 'Hans Ernstbocht', 'Arie Luyendyk', 'Turn 14'],
  monza: ['Variante del Rettifilo 1', 'Variante del Rettifilo 2', 'Curva Grande', 'Variante della Roggia 1', 'Variante della Roggia 2', 'Turn 6', 'Lesmo 1', 'Lesmo 2', 'Curva del Serraglio', 'Ascari 1', 'Parabolica'],
  baku: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turn 10', 'Turn 11', 'Turn 12', 'Turn 13', 'Turn 14', 'Turn 15', 'Castle', 'Turn 17', 'Turn 18', 'Turn 19', 'Turn 20'],
  marina_bay: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turn 10', 'Singapore Sling', 'Turn 12', 'Turn 13', 'Turn 14', 'Turn 15', 'Turn 16', 'Turn 17', 'Turn 18', 'Turn 19'],
  cota: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turn 10', 'Turn 11', 'Turn 12', 'Turn 13', 'Turn 14', 'Turn 15', 'Turn 16', 'Turn 17', 'Turn 18', 'Turn 19', 'Turn 20'],
  rodriguez: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turn 10', 'Turn 11', 'Foro Sol 1', 'Foro Sol 2', 'Foro Sol 3', 'Turn 15', 'Turn 16', 'Turn 17'],
  interlagos: ['Senna S 1', 'Senna S 2', 'Curva do Sol', 'Descida do Lago', 'Turn 5', 'Turn 6', 'Turn 7', 'Laranjinha', 'Turn 9', 'Turn 10', 'Mergulho', 'Juncao', 'Subida dos Boxes', 'Turn 14', 'Turn 15'],
  las_vegas: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turn 10', 'Turn 11', 'Turn 12', 'Turn 13', 'Turn 14', 'Turn 15', 'Turn 16', 'Turn 17'],
  losail: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turn 10', 'Turn 11', 'Turn 12', 'Turn 13', 'Turn 14', 'Turn 15', 'Turn 16'],
  yas_marina: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5', 'Turn 6', 'Turn 7', 'Turn 8', 'Turn 9', 'Turn 10', 'Turn 11', 'Turn 12', 'Turn 13', 'Turn 14', 'Turn 15', 'Turn 16'],
};

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
