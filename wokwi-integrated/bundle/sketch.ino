#include <Arduino.h>
// Integrated software demo: two boom barriers and a reversible stepper bay.
// End-position pins come from an independent ideal mechanical-plant model.
const byte EMERGENCY=2, DOWN_LIMIT=3, UP_LIMIT=4, STEP_PIN=5, DIR_PIN=6, TRIG=7, ECHO=8;
enum BayState {UP,DOWN,MOVING_DOWN,MOVING_UP,UNKNOWN};
BayState bay=UP;
const char* health="HEALTHY";
bool emergencyLatch=false,wasOccupied=false,clearTrack=false,presentTrack=false,limitTrack=false;
unsigned long nowMs=0,sampleAt=0,clearAt=0,presentAt=0,moveAt=0,limitAt=0,holdAt=0,lastOutput=0,lastStep=0,sequence=0;
int distanceCm=-1;unsigned long holdMs=600000;
char line[80],seen[8][17];byte lineLength=0,seenIndex=0;
bool lastArrive=false,lastExit=false;
struct Gate {byte openPin,closedPin,beam;bool targetOpen,moving,sawCar,clearTracking;unsigned long started,opened,clearAt;};
Gate entry={A0,A1,11,false,false,false,false,0,0,0},exitGate={A2,A3,12,false,false,false,false,0,0,0};
bool asserted(byte pin){return digitalRead(pin)==LOW;}
bool clearPresence(){return distanceCm>150;}
bool present(){return distanceCm>=0&&distanceCm<50;}
bool healthy(){return strcmp(health,"HEALTHY")==0;}
const char* bayName(){switch(bay){case UP:return "UP";case DOWN:return "DOWN";case MOVING_DOWN:return "MOVING_DOWN";case MOVING_UP:return "MOVING_UP";default:return "UNKNOWN";}}
const char* gateName(const Gate& gate){if(gate.moving)return gate.targetOpen?"OPENING":"CLOSING";if(asserted(gate.openPin)&&!asserted(gate.closedPin))return "OPEN";if(asserted(gate.closedPin)&&!asserted(gate.openPin))return "CLOSED";return "UNKNOWN";}
void fail(const char* reason){health=reason;bay=UNKNOWN;digitalWrite(STEP_PIN,LOW);}
void gateMove(Gate& gate,bool open){
 if(gate.targetOpen==open && (gate.moving || (open?asserted(gate.openPin):asserted(gate.closedPin))))return;
 gate.targetOpen=open;gate.moving=true;gate.started=nowMs;gate.sawCar=false;gate.clearTracking=false;
 if(&gate==&entry)OCR1A=open?3000:1000;else OCR1B=open?3000:1000;
}
void bayMove(bool down){bay=down?MOVING_DOWN:MOVING_UP;digitalWrite(DIR_PIN,down?HIGH:LOW);moveAt=nowMs;limitTrack=false;lastStep=micros();}
void gateTick(Gate& gate){
 const bool blocked=asserted(gate.beam);
 if(blocked){gate.sawCar=true;gate.clearTracking=false;if(gate.moving&&!gate.targetOpen)gateMove(gate,true);}
 else if(!gate.clearTracking){gate.clearTracking=true;gate.clearAt=nowMs;}
 if(gate.moving){
  const bool reached=asserted(gate.targetOpen?gate.openPin:gate.closedPin);
  if(reached){gate.moving=false;gate.opened=nowMs;}
  else if(nowMs-gate.started>3000UL){health="GATE_FAULT";gate.moving=false;}
 }
 if(!gate.moving&&gate.targetOpen&&!emergencyLatch&&!blocked&&gate.clearTracking&&nowMs-gate.clearAt>=1500UL&&(gate.sawCar||nowMs-gate.opened>=15000UL))gateMove(gate,false);
}
bool arrive(){
 if(!healthy()||emergencyLatch||!clearPresence()||bay!=UP)return false;
 wasOccupied=false;clearTrack=false;gateMove(entry,true);bayMove(true);return true;
}
void acknowledge(const char* id,bool accepted){Serial.print(F("{\"kind\":\"ack\",\"id\":\""));Serial.print(id);Serial.print(F("\",\"accepted\":"));Serial.print(accepted?1:0);Serial.print(F(",\"distance\":"));Serial.print(distanceCm);Serial.print(F(",\"bay\":\""));Serial.print(bayName());Serial.print(F("\",\"health\":\""));Serial.print(health);Serial.println(F("\"}"));}
void execute(char* input){
 char* id=strtok(input," ");char* verb=strtok(NULL," ");char* value=strtok(NULL," ");
 if(!id||!verb||strlen(id)>16)return;
 for(byte n=0;n<8;n++)if(strcmp(seen[n],id)==0){acknowledge(id,true);return;}
 bool accepted=false;
 if(strcmp(verb,"ARRIVE")==0){if(value)holdMs=constrain(atol(value),5000L,600000L);accepted=arrive();}
 if(strcmp(verb,"EXIT")==0&&healthy()&&!emergencyLatch&&clearPresence()){gateMove(exitGate,true);accepted=true;}
 if(strcmp(verb,"RESET")==0&&digitalRead(EMERGENCY)==LOW&&asserted(DOWN_LIMIT)!=asserted(UP_LIMIT)&&(clearPresence()||present())){
  emergencyLatch=false;health="HEALTHY";bay=asserted(DOWN_LIMIT)?DOWN:UP;wasOccupied=present();clearTrack=false;holdAt=nowMs-holdMs;accepted=true;
 }
 if(accepted){strncpy(seen[seenIndex],id,16);seen[seenIndex][16]=0;seenIndex=(seenIndex+1)%8;}
 acknowledge(id,accepted);
}
void output(){
 if(nowMs-lastOutput<200UL)return;lastOutput=nowMs;
 Serial.print(F("{\"kind\":\"telemetry\",\"seq\":"));Serial.print(++sequence);
 Serial.print(F(",\"ms\":"));Serial.print(nowMs);Serial.print(F(",\"bay\":\""));Serial.print(bayName());
 Serial.print(F("\",\"entry\":\""));Serial.print(gateName(entry));Serial.print(F("\",\"exit\":\""));Serial.print(gateName(exitGate));
 Serial.print(F("\",\"occupancy\":\""));Serial.print(present()?(presentTrack&&nowMs-presentAt>=3000UL?"PRESENT":"DETECTING"):clearPresence()?"CLEAR":"UNCERTAIN");
 Serial.print(F("\",\"distance\":"));Serial.print(distanceCm);Serial.print(F(",\"health\":\""));Serial.print(health);
 Serial.print(F("\",\"emergency\":"));Serial.print(emergencyLatch?1:0);Serial.print(F(",\"entryBeam\":"));Serial.print(asserted(11)?1:0);
 Serial.print(F(",\"exitBeam\":"));Serial.print(asserted(12)?1:0);Serial.print(F(",\"clearanceMs\":"));Serial.print(clearTrack?nowMs-clearAt:0);Serial.println('}');
}
void setup(){
 const byte inputs[]={EMERGENCY,DOWN_LIMIT,UP_LIMIT,11,12,A0,A1,A2,A3,A4,A5};
 const byte outputs[]={STEP_PIN,DIR_PIN,TRIG,9,10,13};
 for(byte pin:inputs)pinMode(pin,INPUT_PULLUP);
 for(byte pin:outputs)pinMode(pin,OUTPUT);
 pinMode(ECHO,INPUT);TCCR1A=_BV(COM1A1)|_BV(COM1B1)|_BV(WGM11);TCCR1B=_BV(WGM13)|_BV(WGM12)|_BV(CS11);ICR1=39999;OCR1A=1000;OCR1B=1000;Serial.begin(115200);
}
void loop(){
 nowMs=millis();
 if(nowMs-sampleAt>=60UL){sampleAt=nowMs;digitalWrite(TRIG,LOW);delayMicroseconds(2);digitalWrite(TRIG,HIGH);delayMicroseconds(10);digitalWrite(TRIG,LOW);unsigned long width=pulseIn(ECHO,HIGH,25000UL);distanceCm=width?int(width/58UL):-1;nowMs=millis();
  if(clearPresence()){if(!clearTrack){clearTrack=true;clearAt=nowMs;}}else clearTrack=false;
  if(present()){if(!presentTrack){presentTrack=true;presentAt=nowMs;}}else presentTrack=false;
 }
 if(digitalRead(EMERGENCY)==HIGH&&!emergencyLatch){emergencyLatch=true;gateMove(entry,true);gateMove(exitGate,true);if(healthy()&&bay!=DOWN)bayMove(true);}
 while(Serial.available()){char ch=Serial.read();if(ch=='\n'){line[lineLength]=0;execute(line);lineLength=0;}else if(ch!='\r'){if(lineLength<sizeof(line)-1)line[lineLength++]=ch;else lineLength=0;}}
 const bool arrival=asserted(A4),exiting=asserted(A5);if(arrival&&!lastArrive)arrive();if(exiting&&!lastExit&&healthy()&&clearPresence())gateMove(exitGate,true);lastArrive=arrival;lastExit=exiting;
 if(nowMs>200UL&&healthy()&&!emergencyLatch&&!clearPresence()&&!present())fail("SENSOR_FAULT");
 if(asserted(DOWN_LIMIT)&&asserted(UP_LIMIT))fail("POSITION_FAULT");
 if(bay==MOVING_DOWN||bay==MOVING_UP){
  if(bay==MOVING_UP&&!clearPresence())fail("SENSOR_FAULT");
  else {
   const bool target=asserted(bay==MOVING_DOWN?DOWN_LIMIT:UP_LIMIT);
   if(target){if(!limitTrack){limitTrack=true;limitAt=nowMs;}if(nowMs-limitAt>=50UL){bay=bay==MOVING_DOWN?DOWN:UP;holdAt=nowMs;clearTrack=false;}}
   else {limitTrack=false;if(micros()-lastStep>=6000UL){lastStep=micros();digitalWrite(STEP_PIN,HIGH);delayMicroseconds(10);digitalWrite(STEP_PIN,LOW);}}
   if((bay==MOVING_DOWN||bay==MOVING_UP)&&nowMs-moveAt>5000UL)fail("MOTOR_FAULT");
  }
 }
 if(presentTrack&&nowMs-presentAt>=3000UL)wasOccupied=true;
 if(bay==DOWN&&healthy()&&!emergencyLatch&&clearTrack&&nowMs-clearAt>=10000UL&&(wasOccupied||nowMs-holdAt>=holdMs))bayMove(false);
 if(healthy()&&!emergencyLatch&&((bay==DOWN&&!asserted(DOWN_LIMIT))||(bay==UP&&!asserted(UP_LIMIT))))fail("POSITION_FAULT");
 gateTick(entry);gateTick(exitGate);digitalWrite(13,!healthy()||emergencyLatch);output();
}
