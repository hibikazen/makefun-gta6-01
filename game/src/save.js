// Save / load through localStorage: money, completed missions, health and
// the player's last position. A save is just JSON; nothing leaves the machine.
const KEY = 'sunset-bay-save-v1';

export function saveGame(data) {
  try {
    const payload = {
      version: 1,
      savedAt: Date.now(),
      money: data.money,
      missionsDone: data.missionsDone,
      health: data.health,
      x: data.x,
      z: data.z,
      heading: data.heading,
      clockMinutes: data.clockMinutes,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}
