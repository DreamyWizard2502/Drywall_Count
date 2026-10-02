// "Hot choice" lists. Anything typed that isn't on a list gets remembered
// (see learn() in state.js) and shows up as a chip next time.

export const SECTION_NAMES = [
  'Garage', 'Kitchen', 'Living Room', 'Family Room', 'Dining Room', 'Great Room',
  'Foyer', 'Hallway', 'Stairwell', 'Master Bedroom', 'Master Bath', 'Master Closet',
  'Bedroom', 'Bathroom', 'Half Bath', 'Closet', 'Laundry', 'Pantry', 'Office',
  'Bonus Room', 'Media Room', 'Mudroom', 'Basement', 'Utility Room', 'Porch Ceiling',
];

export const DRYWALL_TYPES = [
  '1/2" Regular', '1/2" Lightweight', '5/8" Type X (Fire)', '1/2" Moisture Resistant',
  '1/2" Mold Resistant', '5/8" Moisture/Mold Type X', '1/2" Ceiling (Sag Resistant)',
  '1/4" Flexible', '3/8" Regular', '1/2" Cement Board',
];

export const SHEET_SIZES = ['4x8', '4x9', '4x10', '4x12', '54"x12', '4x14'];

export const SCREW_TYPES = [
  '1-1/4" Coarse Thread', '1-5/8" Coarse Thread', '2" Coarse Thread',
  '1" Fine Thread', '1-1/4" Fine Thread', '1-5/8" Fine Thread',
];

export const SPECIAL_FEATURES = [
  'Rotunda', 'Dome Ceiling', 'Curved Wall', 'Barrel Ceiling', 'Vaulted Ceiling',
  'Cathedral Ceiling', 'Tray Ceiling', 'Coffered Ceiling', 'Arched Opening', 'Niche',
  'Soffit', 'Column Wrap',
];

export const STANDARD_CEILINGS = ['8', '9', '10'];

// Ceilings taller than this (feet) usually need scaffolding.
export const SCAFFOLD_OVER_FT = 10;
