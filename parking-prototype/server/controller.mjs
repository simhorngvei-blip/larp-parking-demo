export class Controller {
  constructor(id) {
    this.id = id; this.now = 0; this.position = 'UP'; this.distance = 250;
    this.health = 'HEALTHY'; this.mode = 'NORMAL'; this.occupancy = 'CLEAR';
    this.clearFor = 0; this.presentFor = 0; this.holdUntil = null; this.holdDuration = 600000;
    this.movementUntil = null; this.jam = false; this.commands = new Map(); this.wasOccupied = false;
  }
  unlock(commandId, duration = 600000) {
    if (this.commands.has(commandId)) return this.commands.get(commandId);
    const accepted = this.health === 'HEALTHY' && this.mode === 'NORMAL' && ['UP', 'DOWN'].includes(this.position);
    const result = { accepted, reason: accepted ? null : 'Device is unavailable or movement is already in progress' };
    this.commands.set(commandId, result);
    if (accepted) {
      this.holdDuration = Math.min(600000, Math.max(1000, duration));
      if (this.position === 'UP') { this.position = 'MOVING_DOWN'; this.movementUntil = this.now + 2000; }
      else this.holdUntil = this.now + this.holdDuration;
    }
    return result;
  }
  observe(distance) {
    this.distance = distance;
    if (distance === null || !Number.isFinite(distance) || (distance >= 50 && distance <= 150)) this.occupancy = 'UNCERTAIN';
    else this.occupancy = distance < 50 ? 'DETECTING' : 'CLEAR';
    if (this.occupancy !== 'CLEAR') this.clearFor = 0;
    if (this.position === 'MOVING_UP' && this.occupancy !== 'CLEAR') {
      this.position = 'UNKNOWN'; this.health = 'SENSOR_FAULT'; this.movementUntil = null;
    }
  }
  setFault(type) {
    if (type === 'jam') this.jam = true;
    if (type === 'sensor') { this.observe(null); this.health='SENSOR_FAULT'; }
    if (type === 'clear' && this.mode !== 'EMERGENCY_LATCHED') {
      this.jam = false;
      if (this.position !== 'UNKNOWN' && this.distance!==null && this.occupancy!=='UNCERTAIN') { this.health = 'HEALTHY'; this.mode = 'NORMAL'; if(this.position==='DOWN' && this.holdUntil===null)this.holdUntil=0; }
      this.clearFor = 0;
    }
  }
  emergency(active) {
    if (active) {
      this.mode = 'EMERGENCY_LATCHED'; this.holdUntil = null;
      if (this.position !== 'DOWN') { this.position = 'MOVING_DOWN'; this.movementUntil = this.now + 2000; }
    } else if (this.mode === 'EMERGENCY_LATCHED') this.mode = 'RECOVERY_REQUIRED';
  }
  tick(milliseconds) {
    for (let remaining = milliseconds; remaining > 0;) {
      const step = Math.min(250, remaining); remaining -= step; this.now += step;
      if (this.distance !== null && this.distance < 50) {
        this.presentFor += step; this.clearFor = 0;
        this.occupancy = this.presentFor >= 3000 ? 'PRESENT' : 'DETECTING';
        if (this.occupancy === 'PRESENT') { this.wasOccupied = true; this.holdUntil = 0; }
      } else { this.presentFor = 0; if (this.occupancy === 'CLEAR' && this.position === 'DOWN') this.clearFor += step; }
      if (this.movementUntil !== null && this.now >= this.movementUntil) {
        if (this.jam) { this.position = this.position === 'MOVING_DOWN' ? 'UP' : 'DOWN'; this.health = 'MOTOR_FAULT'; }
        else if (this.position === 'MOVING_DOWN') { this.position = 'DOWN'; this.clearFor = 0; this.holdUntil = this.mode==='EMERGENCY_LATCHED'?null:this.now + this.holdDuration; }
        else if (this.position === 'MOVING_UP') { this.position = 'UP'; this.wasOccupied = false; this.holdUntil = null; }
        this.movementUntil = null;
      }
      if (this.position === 'DOWN' && this.mode === 'NORMAL' && this.health === 'HEALTHY' && this.occupancy === 'CLEAR' && this.clearFor >= 10000 && this.holdUntil !== null && this.now >= this.holdUntil) {
        this.position = 'MOVING_UP'; this.movementUntil = this.now + 2000;
      }
    }
  }
  snapshot() {
    let state = this.position === 'UP' ? 'LOCKED_VACANT' : 'AWAITING_ARRIVAL';
    if (this.position === 'MOVING_DOWN') state = 'UNLOCKING';
    if (this.position === 'MOVING_UP') state = 'RELOCKING';
    if (this.occupancy === 'PRESENT') state = 'OCCUPIED_PARKED';
    if (this.wasOccupied && this.occupancy === 'CLEAR' && this.position === 'DOWN') state = 'DEPARTURE_DELAY';
    if (this.occupancy === 'UNCERTAIN' || this.health !== 'HEALTHY') state = 'FAULT_HOLD';
    if (this.mode !== 'NORMAL') state = this.mode === 'EMERGENCY_LATCHED' && this.position === 'DOWN' ? 'EMERGENCY_FREE' : this.mode;
    return { id: this.id, position: this.position, occupancy: this.occupancy, state, health: this.health, mode: this.mode, distance: this.distance, now: this.now, clearanceMs: this.clearFor, holdRemainingMs: this.holdUntil === null ? 0 : Math.max(0, this.holdUntil - this.now) };
  }
}
