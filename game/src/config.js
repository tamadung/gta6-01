// SOLMARA — an original sun-soaked coastal city, built for one open-world crime game.
// Every tuning number, colour and city constant lives here so the sim and the
// renderer agree on the world. The city is a street grid: vertical avenues and
// horizontal streets, blocks of buildings between them, a beach along the south
// edge and docks on the east. World units are pixels at zoom 1.

export const STEP = 1 / 60; // fixed simulation step, seconds

export const WORLD = { width: 3200, height: 2400 };

// Streets: centre lines of the avenues (vertical) and streets (horizontal).
// Road width is the asphalt; sidewalks run just outside it.
export const AVENUES = [200, 700, 1200, 1700, 2200, 2700];
export const STREETS = [200, 600, 1000, 1400, 1800, 2200];
export const ROAD_W = 96;
export const SIDEWALK_W = 26;

// Beach (south strip) and docks (east strip) are water-adjacent districts.
export const BEACH = { y: 2280, sandH: 120 }; // sand starts here, water below it
export const DOCKS = { x: 2920 }; // piers and warehouses east of here

// Sun-soaked palette: warm asphalt, tan sidewalks, terracotta and cream roofs.
export const PAL = {
  grass: '#7fae5a',
  grassDark: '#6d9c4c',
  asphalt: '#4a4a52',
  asphaltDark: '#3e3e46',
  lane: '#e8d98a',
  sidewalk: '#cbb98f',
  sidewalkEdge: '#b3a075',
  sand: '#e8d39a',
  water: '#2e7fa8',
  waterDeep: '#1f6a92',
  roofA: '#c96f4a',
  roofB: '#e0a458',
  roofC: '#8a6f9e',
  roofD: '#5a8a6f',
  roofE: '#b5544a',
  wall: '#d8cbb2',
  wallDark: '#b8a98c',
  park: '#6fae56',
  tree: '#3f7a3a',
  treeLight: '#5a9a4a',
  plaza: '#d9c9a3',
  cop: '#2a4a8a',
  copLight: '#3a6ac0',
  taxi: '#e8c832',
  hud: '#101018',
  hudText: '#f5edd8',
  gold: '#f2c14e',
  red: '#e0483e',
  green: '#58c96b',
};

export const PLAYER = {
  radius: 14,
  walkSpeed: 190,
  runSpeed: 330,
  accel: 1400,
  health: 100,
  punchDamage: 12,
  punchRange: 34,
  punchArc: 1.1,
};

// Car models: name, top speed (px/s), acceleration, handling (turn rate), size, colour.
export const CAR_MODELS = {
  sedan:  { name: 'Sedan',    top: 420, accel: 300, turn: 2.6, len: 52, wid: 26, color: '#7a8aa0' },
  taxi:   { name: 'Taxi',     top: 400, accel: 300, turn: 2.6, len: 52, wid: 26, color: PAL.taxi },
  coupe:  { name: 'Coupe',    top: 560, accel: 420, turn: 3.1, len: 50, wid: 24, color: '#c94a5a' },
  truck:  { name: 'Truck',    top: 330, accel: 220, turn: 2.0, len: 66, wid: 28, color: '#8a7a5a' },
  van:    { name: 'Van',      top: 360, accel: 240, turn: 2.2, len: 58, wid: 28, color: '#5a7a8a' },
  cop:    { name: 'Patrol',   top: 540, accel: 460, turn: 3.2, len: 52, wid: 26, color: PAL.cop },
  sports: { name: 'Veloce',   top: 640, accel: 520, turn: 3.4, len: 48, wid: 24, color: '#e8a020' },
};

export const TRAFFIC = {
  count: 26, // ambient traffic cars
  pedCount: 34, // ambient pedestrians
  spawnGap: 3.2, // seconds between traffic respawns when one is lost
};

export const WANTED = {
  max: 5,
  decayDelay: 18, // seconds with no crime and no police sighting before it drops
  decayEvery: 9, // seconds per star lost while hidden
  // Police cars on the road per wanted level (index = stars).
  copsPerStar: [0, 1, 2, 3, 4, 6],
  // Foot cops near the player per wanted level.
  footPerStar: [0, 0, 1, 1, 2, 3],
  bustRadius: 46, // a cop this close to a slow player starts the bust
  bustTime: 1.6, // seconds inside bustRadius to be busted
  sightRange: 620, // police see the player this far (line of sight is free)
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 420,
  pistolAmmo: 30,
  pistolFireRate: 0.22,
  copDamage: 8,
  copRange: 380,
  copFireRate: 0.8,
  bulletSpeed: 900,
};

export const ECONOMY = {
  startCash: 150,
  resprayCost: 100,
  ammoCost: 50,
  ammoPack: 30,
  healthCost: 80,
  taxiFareMin: 50,
  taxiFareMax: 150,
  packageValue: 100,
  packages: 10,
};

export const MISSIONS = [
  {
    id: 'pickup',
    title: 'The Pickup',
    brief: 'A package is waiting at the east docks. Bring it back to the garage on Marlin Ave.',
    reward: 500,
  },
  {
    id: 'getaway',
    title: 'Getaway Driver',
    brief: 'Steal the yellow Veloce parked by the plaza and reach the hideout on Coral St. The cops will notice.',
    reward: 800,
  },
  {
    id: 'collect',
    title: 'Collect the Debts',
    brief: 'Three debtors owe the crew. Visit each one and collect. They will not argue twice.',
    reward: 1200,
  },
  {
    id: 'heat',
    title: 'Lose the Heat',
    brief: 'The crew needs you clean. Raise three stars, then lose them — hide, or get a respray.',
    reward: 1000,
  },
  {
    id: 'bigone',
    title: 'The Big One',
    brief: 'Rob the Solmara Trust Bank downtown, then run the loot to the beach house. Four stars, no mistakes.',
    reward: 5000,
  },
];

// Where the story puts the player and the key places (world coords).
export const PLACES = {
  garage: { x: 700, y: 600, label: 'Garage' },
  docks: { x: 2960, y: 1000, label: 'East Docks' },
  plaza: { x: 1200, y: 1000, label: 'Plaza' },
  hideout: { x: 1700, y: 1800, label: 'Hideout' },
  bank: { x: 1700, y: 1000, label: 'Solmara Trust Bank' },
  beachHouse: { x: 700, y: 2260, label: 'Beach House' },
  spray: { x: 2200, y: 1400, label: 'Respray' },
  gunshop: { x: 1200, y: 1400, label: 'Ammo & Health' },
  market: { x: 700, y: 1000, label: 'Market' },
};
