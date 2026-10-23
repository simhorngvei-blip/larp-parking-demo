import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export const BAY_IDS = ['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'];
export class Store {
  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file); this.db.exec('PRAGMA journal_mode=WAL'); this.devices = new Map();
    this.db.exec(`CREATE TABLE IF NOT EXISTS policies(version INTEGER PRIMARY KEY, config TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS visits(id TEXT PRIMARY KEY,name TEXT,plate TEXT,unit TEXT,kind TEXT,status TEXT,bayId TEXT,approved INTEGER,version INTEGER,config TEXT,created TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_bay ON visits(bayId) WHERE status!='COMPLETE' AND bayId IS NOT NULL;
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,time TEXT,title TEXT,detail TEXT,bayId TEXT);
      CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY,bayId TEXT,reason TEXT,status TEXT,created TEXT,outcome TEXT);
      CREATE TABLE IF NOT EXISTS isolated(bayId TEXT PRIMARY KEY);`);
    this.db.exec('CREATE TABLE IF NOT EXISTS parking_times(visitId TEXT PRIMARY KEY,started INTEGER)');
    if (!this.db.prepare('SELECT version FROM policies LIMIT 1').get()) this.db.prepare('INSERT INTO policies VALUES(1,?)').run(JSON.stringify({requireHost:false,eligible:['V-01','V-02','V-03','V-04'],arrivalMinutes:10,visitMinutes:120}));
  }
  setDevices(devices) { this.devices = new Map(devices.map(device => [device.id,device])); }
  requireRole(actor, ...allowed) { if (!allowed.includes(actor)) throw new Error(`${allowed.join(' or ')} role required`); }
  policy() { const row = this.db.prepare('SELECT * FROM policies ORDER BY version DESC LIMIT 1').get(); return {version:row.version,...JSON.parse(row.config)}; }
  event(title, detail, bayId = null) { this.db.prepare('INSERT INTO events(time,title,detail,bayId) VALUES(?,?,?,?)').run(new Date().toISOString(),title,detail,bayId); }
  getVisit(id) { const row=this.db.prepare('SELECT * FROM visits WHERE id=?').get(id); if (!row) throw new Error('Visit not found'); return {...row,config:JSON.parse(row.config)}; }
  register(actor, input) {
    this.requireRole(actor,'guard');
    const name=String(input.name || '').trim(), plate=String(input.plate || '').trim().toUpperCase(), unit=String(input.unit || '').trim();
    if (!name || name.length>60 || !/^[A-Z0-9 -]{3,15}$/.test(plate) || !/^\d{1,3}-\d{1,3}$/.test(unit)) throw new Error('Enter a name, valid plate and unit such as 10-02');
    const policy=this.policy(), id=randomUUID();
    this.db.prepare('INSERT INTO visits VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,name,plate,unit,'visitor','REGISTERED',null,policy.requireHost?0:1,policy.version,JSON.stringify(policy),new Date().toISOString());
    this.event('Visitor registered',`${name} · ${plate} · Unit ${unit}`); return this.getVisit(id);
  }
  approve(actor,id) { this.requireRole(actor,'guard'); this.getVisit(id); this.db.prepare('UPDATE visits SET approved=1 WHERE id=?').run(id); this.event('Host approval recorded','Simulated host approval recorded by the guard'); }
  available(id) {
    const device=this.devices.get(id);
    return device && device.health==='HEALTHY' && device.mode==='NORMAL' && device.position==='UP' && device.occupancy==='CLEAR' && !this.db.prepare('SELECT bayId FROM isolated WHERE bayId=?').get(id) && !this.db.prepare("SELECT id FROM visits WHERE bayId=? AND status!='COMPLETE'").get(id);
  }
  assign(actor,id) {
    this.requireRole(actor,'guard'); const visit=this.getVisit(id);
    if (visit.bayId) return visit;
    if (!visit.approved) throw new Error('Host approval is required before allocation');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const bayId=visit.config.eligible.find(bay => this.available(bay));
      if (!bayId) throw new Error('No eligible visitor bay is available. Ask the guard for an approved waiting or exit instruction.');
      this.db.prepare("UPDATE visits SET bayId=?,status='RESERVED' WHERE id=?").run(bayId,id); this.db.exec('COMMIT');
      this.event('Bay assigned',`${visit.plate} assigned to ${bayId}`,bayId); return this.getVisit(id);
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  publish(actor,config) {
    this.requireRole(actor,'management');
    if (!Array.isArray(config.eligible) || !config.eligible.length || config.eligible.some(id => !['V-01','V-02','V-03','V-04'].includes(id))) throw new Error('Select visitor bays only');
    if (typeof config.requireHost!=='boolean' || !Number.isInteger(config.arrivalMinutes) || config.arrivalMinutes<1 || config.arrivalMinutes>10 || !Number.isInteger(config.visitMinutes) || config.visitMinutes<15 || config.visitMinutes>480) throw new Error('Arrival window must be 1-10 minutes; visit window 15-480 minutes');
    const version=this.policy().version+1;const saved={requireHost:config.requireHost,eligible:config.eligible,arrivalMinutes:config.arrivalMinutes,visitMinutes:config.visitMinutes};this.db.prepare('INSERT INTO policies VALUES(?,?)').run(version,JSON.stringify(saved));
    this.event('Workflow published',`Version ${version} applies to new visits. Safety rules are unchanged.`); return this.policy();
  }
  listVisits() { return this.db.prepare('SELECT * FROM visits ORDER BY created DESC').all().map(row => ({...row,config:JSON.parse(row.config)})); }
  close() { this.db.close(); }
}
