// Sunset Bay — world constants, district definitions and tuning values.
// Everything here is original: the city, its districts and its names are invented.

export const WORLD = {
  HALF: 300,            // playable ground extends to +/-300 on X and Z
  ROAD_WIDTH: 12,
  SPACING: 60,          // distance between parallel streets
  BLOCK_INSET: 7,       // sidewalk margin inside each block
};

// Streets run both ways at these coordinates (9 north-south, 9 east-west).
export const STREETS = [-240, -180, -120, -60, 0, 60, 120, 180, 240];

// Districts are rectangles; a block belongs to the first district containing its centre.
export const DISTRICTS = [
  { name: 'Downtown Meridian', x0: -95, z0: -95, x1: 95, z1: 95,
    minH: 34, maxH: 92, palette: [0x8f9bb0, 0x6f7f99, 0xb0a08f, 0x7d8ca3], lots: 1 },
  { name: 'Palm Marina', x0: -300, z0: 150, x1: 300, z1: 300,
    minH: 7, maxH: 18, palette: [0xf2c9a0, 0xffd9b3, 0xe8a87c, 0xfff1d6], lots: 4 },
  { name: 'Coral Heights', x0: -300, z0: -300, x1: -95, z1: -95,
    minH: 10, maxH: 26, palette: [0xd98c7a, 0xc97b6a, 0xe8b48c, 0xb96a5e], lots: 4 },
  { name: 'Port Delmar', x0: 150, z0: -95, x1: 300, z1: 150,
    minH: 8, maxH: 16, palette: [0x9aa3a8, 0x7e8b91, 0xb5a48f, 0x8a9499], lots: 2 },
  { name: 'Old Town', x0: -300, z0: 60, x1: -95, z1: 240,
    minH: 8, maxH: 20, palette: [0xa86a4a, 0x94573c, 0xb57a52, 0x8a4f38], lots: 4 },
  { name: 'Midtown', x0: -300, z0: -300, x1: 300, z1: 300,
    minH: 12, maxH: 34, palette: [0x9aa0ad, 0x8b93a3, 0xb0a898, 0x7f8a96], lots: 2 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d;
  }
  return DISTRICTS[DISTRICTS.length - 1];
}

// Key story locations (world coordinates). Every one sits on a road or open
// ground — never inside a block where a building could spawn on top of it.
export const PLACES = {
  playerStart: { x: 0, z: 210 },            // Meridian Blvd (mission-free spawn)
  garage: { x: -210, z: 150 },              // Mara's garage lot (mission 1 delivery)
  payphone: { x: 30, z: -60 },              // Downtown payphone (mission 2 start)
  dock: { x: 225, z: 30 },                  // Port Delmar dock (mission 3)
  marinaDrop: { x: 0, z: 265 },             // Palm Marina drop-off
  coupeSpot: { x: 90, z: -120 },            // gold coupe parked (mission 1 target)
  policeStation: { x: 60, z: 90 },          // respawn after BUSTED
  hospital: { x: -150, z: -60 },            // respawn after WASTED
  ferrisWheel: { x: 90, z: 278 },           // Marina pier landmark
};

export const GAME = {
  START_MONEY: 250,
  MAX_HEALTH: 100,
  WALK_SPEED: 6,
  RUN_SPEED: 10.5,
  JUMP_SPEED: 8.5,
  GRAVITY: 22,
  CAR_MAX_SPEED: 40,
  CAR_MAX_REVERSE: 13,
  CAR_ACCEL: 16,
  CAR_BRAKE: 30,
  TRAFFIC_COUNT: 14,
  PARKED_COUNT: 12,
  PED_COUNT: 26,
  PICKUP_COUNT: 12,
  PICKUP_VALUE: 50,
  CLOCK_START_MINUTES: 18 * 60 + 30,        // golden hour: 18:30
  CLOCK_RATE: 1.0,                          // game minutes per real second
};

export const MISSION_REWARDS = [500, 800, 1500];

export const CAR_COLORS = [
  0xc23b3b, 0x3b6fc2, 0x3bc25a, 0xd8d8d8, 0x2b2b33, 0xd8a03b,
  0x7a3bc2, 0x3bc2b8, 0xe07a3b, 0x9fb3c8,
];
