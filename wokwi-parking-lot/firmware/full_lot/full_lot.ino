#include <Arduino.h>
// Nine independent STEP/DIR parking barriers with observed end switches.
const char* IDS[]={"R-101","R-102","R-103","R-104","V-01","V-02","V-03","V-04","T-01"};
enum Position {UP,DOWN,MOVING_DOWN,MOVING_UP,UNKNOWN};
struct Bay {Position position;const char* health;int distance;bool occupied,clearTrack,presentTrack,limitTrack;unsigned long clearAt,presentAt,moveAt,limitAt,holdAt,holdMs,lastStep;};
Bay bays[9];
struct Gate {byte openPin,closedPin,beam;bool target,moving,sawCar,clearTrack;unsigned long started,opened,clearAt;};
Gate entry={5,6,3,false,false,false,false,0,0,0},exitGate={7,8,4,false,false,false,false,0,0,0};
bool emergency=false,initialized=false,gateFault=false;unsigned long nowMs=0,lastSample=0,lastOutput=0,sequence=0;byte nextSensor=0;
char line[96],seen[12][17];byte lineLength=0,seenIndex=0;
byte basePin(byte i){return 14+6*i;}
bool asserted(byte pin){return digitalRead(pin)==LOW;}
bool clearPresence(const Bay& b){return b.distance>150;}
bool present(const Bay& b){return b.distance>=0&&b.distance<50;}
bool healthy(const Bay& b){return strcmp(b.health,"HEALTHY")==0;}
const char* positionName(Position p){switch(p){case UP:return "UP";case DOWN:return "DOWN";case MOVING_DOWN:return "MOVING_DOWN";case MOVING_UP:return "MOVING_UP";default:return "UNKNOWN";}}
const char* occupancy(const Bay& b){return present(b)?(b.presentTrack&&nowMs-b.presentAt>=3000UL?"PRESENT":"DETECTING"):clearPresence(b)?"CLEAR":"UNCERTAIN";}
const char* gateName(const Gate& g){if(g.moving)return g.target?"OPENING":"CLOSING";if(asserted(g.openPin)&&!asserted(g.closedPin))return "OPEN";if(asserted(g.closedPin)&&!asserted(g.openPin))return "CLOSED";return "UNKNOWN";}
void fail(byte i,const char* reason){bays[i].health=reason;bays[i].position=UNKNOWN;digitalWrite(basePin(i),LOW);}
void gateMove(Gate& g,bool open){if(g.target==open&&(g.moving||asserted(open?g.openPin:g.closedPin)))return;g.target=open;g.moving=true;g.started=nowMs;g.sawCar=false;g.clearTrack=false;if(&g==&entry)OCR1A=open?3000:1000;else OCR1B=open?3000:1000;}
void gateTick(Gate& g){
 const bool blocked=asserted(g.beam);if(blocked){g.sawCar=true;g.clearTrack=false;if(g.moving&&!g.target)gateMove(g,true);}else if(!g.clearTrack){g.clearTrack=true;g.clearAt=nowMs;}
 if(g.moving){if(asserted(g.target?g.openPin:g.closedPin)){g.moving=false;g.opened=nowMs;}else if(nowMs-g.started>3000UL){g.moving=false;gateFault=true;}}
 if(!g.moving&&g.target&&!emergency&&!blocked&&g.clearTrack&&nowMs-g.clearAt>=1500UL&&(g.sawCar||nowMs-g.opened>=15000UL))gateMove(g,false);
}
void move(byte i,bool down){Bay& b=bays[i];b.position=down?MOVING_DOWN:MOVING_UP;digitalWrite(basePin(i)+1,down?HIGH:LOW);b.moveAt=nowMs;b.limitTrack=false;b.lastStep=micros();}
bool unlock(byte i,unsigned long duration){Bay& b=bays[i];if(!initialized||gateFault||!healthy(b)||emergency||!clearPresence(b)||b.position!=UP)return false;b.occupied=false;b.clearTrack=false;b.holdMs=constrain(duration,5000UL,600000UL);move(i,true);return true;}
bool resetBay(byte i){Bay& b=bays[i];const byte pin=basePin(i);if(asserted(pin+2)==asserted(pin+3)||(!clearPresence(b)&&!present(b)))return false;b.position=asserted(pin+2)?DOWN:UP;b.health="HEALTHY";b.occupied=present(b);b.clearTrack=false;b.holdAt=nowMs-b.holdMs;return true;}
int findBay(const char* id){if(id)for(byte i=0;i<9;i++)if(strcmp(IDS[i],id)==0)return i;return -1;}
void ack(const char* id,bool accepted){Serial.print(F("{\"kind\":\"ack\",\"id\":\""));Serial.print(id);Serial.print(F("\",\"accepted\":"));Serial.print(accepted?1:0);Serial.println('}');}
void execute(char* text){
 char* id=strtok(text," ");char* verb=strtok(NULL," ");char* arg=strtok(NULL," ");char* value=strtok(NULL," ");if(!id||!verb||strlen(id)>16)return;
 for(byte i=0;i<12;i++)if(strcmp(seen[i],id)==0){ack(id,true);return;}
 bool accepted=false;
 if(strcmp(verb,"ARRIVE")==0){accepted=unlock(1,arg?atol(arg):600000UL);if(accepted)gateMove(entry,true);}
 if(strcmp(verb,"UNLOCK")==0){const int i=findBay(arg);if(i>=0)accepted=unlock(i,value?atol(value):600000UL);}
 if(strcmp(verb,"ENTER")==0&&!emergency&&!gateFault&&initialized){const int i=findBay(arg);if(i>=0&&bays[i].position==DOWN&&healthy(bays[i])&&clearPresence(bays[i])){gateMove(entry,true);accepted=true;}}
 if(strcmp(verb,"EXIT")==0&&!emergency&&!gateFault&&initialized){const int i=arg?findBay(arg):1;if(i>=0&&healthy(bays[i])&&clearPresence(bays[i])){gateMove(exitGate,true);accepted=true;}}
 if(strcmp(verb,"RESET")==0&&digitalRead(2)==LOW){if(arg){const int i=findBay(arg);if(i>=0&&!emergency)accepted=resetBay(i);}else{accepted=true;for(byte i=0;i<9;i++)if(!resetBay(i))accepted=false;}if(accepted&&!arg){if(asserted(entry.openPin)==asserted(entry.closedPin)||asserted(exitGate.openPin)==asserted(exitGate.closedPin))accepted=false;else{emergency=false;gateFault=false;}}}
 if(accepted){strncpy(seen[seenIndex],id,16);seen[seenIndex][16]=0;seenIndex=(seenIndex+1)%12;}ack(id,accepted);
}
void bayFields(byte i,bool withId){const Bay& b=bays[i];if(withId){Serial.print(F("\"id\":\""));Serial.print(IDS[i]);Serial.print(F("\","));}Serial.print(F("\"bay\":\""));Serial.print(positionName(b.position));Serial.print(F("\",\"occupancy\":\""));Serial.print(occupancy(b));Serial.print(F("\",\"distance\":"));Serial.print(b.distance);Serial.print(F(",\"health\":\""));Serial.print(!withId&&gateFault?"GATE_FAULT":b.health);Serial.print(F("\",\"clearanceMs\":"));Serial.print(b.clearTrack?nowMs-b.clearAt:0);}
void output(){if(nowMs-lastOutput<750UL)return;lastOutput=nowMs;Serial.print(F("{\"kind\":\"telemetry\",\"seq\":"));Serial.print(++sequence);Serial.print(F(",\"ms\":"));Serial.print(nowMs);Serial.print(',');bayFields(1,false);Serial.print(F(",\"entry\":\""));Serial.print(gateName(entry));Serial.print(F("\",\"exit\":\""));Serial.print(gateName(exitGate));Serial.print(F("\",\"emergency\":"));Serial.print(emergency?1:0);Serial.print(F(",\"entryBeam\":"));Serial.print(asserted(3)?1:0);Serial.print(F(",\"exitBeam\":"));Serial.print(asserted(4)?1:0);Serial.print(F(",\"bays\":["));for(byte i=0;i<9;i++){if(i)Serial.print(',');Serial.print('{');bayFields(i,true);Serial.print('}');}Serial.println(F("]}"));}
void setup(){
 pinMode(2,INPUT_PULLUP);pinMode(3,INPUT_PULLUP);pinMode(4,INPUT_PULLUP);for(byte pin=5;pin<=8;pin++)pinMode(pin,INPUT_PULLUP);pinMode(11,OUTPUT);pinMode(12,OUTPUT);pinMode(13,OUTPUT);
 for(byte i=0;i<9;i++){const byte pin=basePin(i);pinMode(pin,OUTPUT);pinMode(pin+1,OUTPUT);pinMode(pin+2,INPUT_PULLUP);pinMode(pin+3,INPUT_PULLUP);pinMode(pin+4,OUTPUT);pinMode(pin+5,INPUT);bays[i].position=UNKNOWN;bays[i].health="HEALTHY";bays[i].distance=-1;bays[i].holdMs=600000UL;}
 TCCR1A=_BV(COM1A1)|_BV(COM1B1)|_BV(WGM11);TCCR1B=_BV(WGM13)|_BV(WGM12)|_BV(CS11);ICR1=39999;OCR1A=1000;OCR1B=1000;Serial.begin(115200);
}
void loop(){
 nowMs=millis();
 if(nowMs-lastSample>=20UL){lastSample=nowMs;const byte i=nextSensor;nextSensor=(nextSensor+1)%9;Bay& b=bays[i];const byte pin=basePin(i);digitalWrite(pin+4,LOW);delayMicroseconds(2);digitalWrite(pin+4,HIGH);delayMicroseconds(10);digitalWrite(pin+4,LOW);const unsigned long width=pulseIn(pin+5,HIGH,25000UL);b.distance=width?int(width/58UL):-1;nowMs=millis();if(clearPresence(b)){if(!b.clearTrack){b.clearTrack=true;b.clearAt=nowMs;}}else b.clearTrack=false;if(present(b)){if(!b.presentTrack){b.presentTrack=true;b.presentAt=nowMs;}}else b.presentTrack=false;}
 if(!initialized&&nowMs>600UL){initialized=true;for(byte i=0;i<9;i++)if(!resetBay(i))fail(i,"POSITION_FAULT");}
 if(digitalRead(2)==HIGH&&!emergency){emergency=true;gateMove(entry,true);gateMove(exitGate,true);for(byte i=0;i<9;i++)if(healthy(bays[i])&&bays[i].position!=DOWN)move(i,true);}
 while(Serial.available()){const char ch=Serial.read();if(ch=='\n'){line[lineLength]=0;execute(line);lineLength=0;}else if(ch!='\r'){if(lineLength<sizeof(line)-1)line[lineLength++]=ch;else lineLength=0;}}
 for(byte i=0;i<9;i++){Bay& b=bays[i];const byte pin=basePin(i);if(!initialized)continue;
  if(healthy(b)&&!emergency&&!clearPresence(b)&&!present(b))fail(i,"SENSOR_FAULT");
  if(asserted(pin+2)&&asserted(pin+3))fail(i,"POSITION_FAULT");
  if(b.position==MOVING_DOWN||b.position==MOVING_UP){if(b.position==MOVING_UP&&!clearPresence(b))fail(i,"SENSOR_FAULT");else{const bool reached=asserted(b.position==MOVING_DOWN?pin+2:pin+3);if(reached){if(!b.limitTrack){b.limitTrack=true;b.limitAt=nowMs;}if(nowMs-b.limitAt>=50UL){b.position=b.position==MOVING_DOWN?DOWN:UP;b.holdAt=nowMs;b.clearTrack=false;}}else{b.limitTrack=false;if(micros()-b.lastStep>=6000UL){b.lastStep=micros();digitalWrite(pin,HIGH);delayMicroseconds(10);digitalWrite(pin,LOW);}}if((b.position==MOVING_DOWN||b.position==MOVING_UP)&&nowMs-b.moveAt>8000UL)fail(i,"MOTOR_FAULT");}}
  if(b.presentTrack&&nowMs-b.presentAt>=3000UL)b.occupied=true;
  if(b.position==DOWN&&healthy(b)&&!emergency&&b.clearTrack&&nowMs-b.clearAt>=10000UL&&(b.occupied||nowMs-b.holdAt>=b.holdMs))move(i,false);
  if(healthy(b)&&!emergency&&((b.position==UP&&!asserted(pin+3))||(b.position==DOWN&&!asserted(pin+2))))fail(i,"POSITION_FAULT");
 }
 gateTick(entry);gateTick(exitGate);digitalWrite(13,emergency);output();
}
