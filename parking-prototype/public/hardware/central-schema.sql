-- Apply through the application migration after public_parking_state exists.

PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS central_sites(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS central_flows(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES central_sites(id),controller_capacity INTEGER NOT NULL CHECK(controller_capacity=8));
CREATE TABLE IF NOT EXISTS central_controllers(id TEXT PRIMARY KEY,flow_id TEXT NOT NULL REFERENCES central_flows(id),bus_address INTEGER NOT NULL CHECK(bus_address BETWEEN 1 AND 8),UNIQUE(flow_id,bus_address));
CREATE TABLE IF NOT EXISTS central_bays(id TEXT PRIMARY KEY,controller_id TEXT NOT NULL REFERENCES central_controllers(id),node_address INTEGER NOT NULL CHECK(node_address BETWEEN 1 AND 6),ordinal INTEGER NOT NULL UNIQUE,mapping TEXT NOT NULL CHECK(mapping IN ('CURRENT_DEMO','UNCOMMISSIONED')),UNIQUE(controller_id,node_address));
CREATE TABLE IF NOT EXISTS central_commands(id TEXT PRIMARY KEY,bay_id TEXT NOT NULL REFERENCES central_bays(id),kind TEXT NOT NULL,route TEXT NOT NULL,status TEXT NOT NULL,requested_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS central_observations(bay_id TEXT PRIMARY KEY REFERENCES central_bays(id),instance TEXT NOT NULL,sequence INTEGER NOT NULL,received_at TEXT NOT NULL,position TEXT NOT NULL,occupancy TEXT NOT NULL,health TEXT NOT NULL,source TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS central_command_bay ON central_commands(bay_id,requested_at);
CREATE VIEW IF NOT EXISTS central_accounts AS SELECT json_extract(u.value,'$.id') AS id,json_extract(u.value,'$.name') AS name,json_extract(u.value,'$.role') AS role,json_extract(u.value,'$.accountStatus') AS accountStatus FROM public_parking_state p,json_each(p.data,'$.users') u;
CREATE VIEW IF NOT EXISTS central_homes AS SELECT json_extract(u.value,'$.id') AS userId,json_extract(h.value,'$.siteId') AS siteId,json_extract(h.value,'$.unit') AS unit,json_extract(h.value,'$.bayId') AS bayId FROM public_parking_state p,json_each(p.data,'$.users') u,json_each(u.value,'$.homes') h;
CREATE VIEW IF NOT EXISTS central_vehicles AS SELECT v.key AS userId,v.value AS plate FROM public_parking_state p,json_each(p.data,'$.residential.vehicles') v;
CREATE VIEW IF NOT EXISTS central_visits AS SELECT json_extract(v.value,'$.id') AS id,json_extract(v.value,'$.userId') AS userId,json_extract(v.value,'$.plate') AS plate,json_extract(v.value,'$.parkingBayId') AS bayId,json_extract(v.value,'$.status') AS status FROM public_parking_state p,json_each(p.data,'$.passes') v;
