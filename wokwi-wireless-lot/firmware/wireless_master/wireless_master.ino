#include <Arduino.h>
// Master handles lanes and addressed packets. No bay STEP/DIR/sensor GPIO.
const char* IDS[]={"R-101","R-102","R-103","R-104","V-01","V-02","V-03","V-04","T-01"};
// Never block radio polling while a long JSON frame drains over USB serial.
// All messages share this queue so acknowledgements cannot split a JSON line.
class UsbQueue:public Print{
 char data[2048];unsigned head=0,tail=0;
 public:
 size_t write(uint8_t c)override{unsigned next=(tail+1)%sizeof(data);if(next==head)return 0;data[tail]=c;tail=next;return 1;}
 unsigned queued(){return (tail+sizeof(data)-head)%sizeof(data);}
 void pump(){while(head!=tail&&Serial.availableForWrite()){Serial.write(data[head]);head=(head+1)%sizeof(data);}}
}usb;
struct Bay {char position[16],occupancy[12],health[20];int distance;unsigned long seen,seq,clearance;bool available;};
Bay bays[9];
struct Gate {byte openPin,closedPin,beam;bool target,moving,sawCar,clearTrack;unsigned long started,opened,clearAt;};
Gate entry={5,6,3,false,false,false,false,0,0,0},exitGate={7,8,4,false,false,false,false,0,0,0};
struct Pending {char id[17],op;byte bay;bool active,arrival;unsigned long deadline,hold,lastSend;};
Pending pending[12];
struct Result {char id[17];bool accepted;};Result results[16];byte resultIndex=0;
bool emergency=false,gateFault=false;unsigned long nowMs=0,lastOutput=0,sequence=0;char input[100],radioLine[2][128];byte inputLength=0,radioLength[2]={0,0};
bool asserted(byte pin){return digitalRead(pin)==LOW;}
bool fresh(byte i){return bays[i].available&&nowMs-bays[i].seen<3500;}
bool healthy(byte i){return fresh(i)&&strcmp(bays[i].health,"HEALTHY")==0;}
bool clearBay(byte i){return fresh(i)&&strcmp(bays[i].occupancy,"CLEAR")==0;}
const char* gateName(const Gate&g){if(g.moving)return g.target?"OPENING":"CLOSING";if(asserted(g.openPin)&&!asserted(g.closedPin))return "OPEN";if(asserted(g.closedPin)&&!asserted(g.openPin))return "CLOSED";return "UNKNOWN";}
void gateMove(Gate&g,bool open){if(g.target==open&&(g.moving||asserted(open?g.openPin:g.closedPin)))return;g.target=open;g.moving=true;g.started=nowMs;g.sawCar=false;g.clearTrack=false;if(&g==&entry)OCR1A=open?3000:1000;else OCR1B=open?3000:1000;}
void gateTick(Gate&g){bool blocked=asserted(g.beam);if(blocked){g.sawCar=true;g.clearTrack=false;if(g.moving&&!g.target)gateMove(g,true);}else if(!g.clearTrack){g.clearTrack=true;g.clearAt=nowMs;}if(g.moving){if(asserted(g.target?g.openPin:g.closedPin)){g.moving=false;g.opened=nowMs;}else if(nowMs-g.started>3000){g.moving=false;gateFault=true;}}if(!g.moving&&g.target&&!emergency&&!blocked&&g.clearTrack&&nowMs-g.clearAt>=1500&&(g.sawCar||nowMs-g.opened>=15000))gateMove(g,false);}
int findBay(const char*id){if(id)for(byte i=0;i<9;i++)if(!strcmp(id,IDS[i]))return i;return -1;}
void ack(const char*id,bool accepted){usb.print(F("{\"kind\":\"ack\",\"id\":\""));usb.print(id);usb.print(F("\",\"accepted\":"));usb.print(accepted?1:0);usb.println('}');}
void finish(const char*id,bool accepted){ack(id,accepted);strncpy(results[resultIndex].id,id,16);results[resultIndex].accepted=accepted;resultIndex=(resultIndex+1)%16;}
void transmit(Pending&p){HardwareSerial&radio=p.bay<5?Serial1:Serial2;radio.print(F("C "));radio.print(p.id);radio.print(' ');radio.print(p.bay);radio.print(' ');radio.print(p.op);radio.print(' ');radio.print(p.deadline);radio.print(' ');radio.println(p.hold);p.lastSend=nowMs;}
bool request(const char*id,byte bay,char op,unsigned long hold,bool arrival=false){for(byte i=0;i<12;i++)if(!pending[i].active){Pending&p=pending[i];strncpy(p.id,id,16);p.id[16]=0;p.bay=bay;p.op=op;p.hold=hold;p.arrival=arrival;p.active=true;p.deadline=nowMs+3000;transmit(p);return true;}return false;}
void radioPacket(byte zone,char*line){
 if(line[0]=='T'){unsigned int node;unsigned long seq,clearance;char position[16],occupancy[12],health[20];int distance;
  if(sscanf(line,"T %u %lu %15s %d %11s %19s %lu",&node,&seq,position,&distance,occupancy,health,&clearance)==7&&node<9&&node/5==zone){Bay&b=bays[node];if(b.available&&seq<b.seq){strcpy(b.health,"NODE_RESTART");b.available=false;return;}b.seq=seq;b.seen=nowMs;b.distance=distance;b.clearance=clearance;strcpy(b.position,position);strcpy(b.occupancy,occupancy);strcpy(b.health,health);b.available=true;}
 }else if(line[0]=='A'){char id[17];unsigned int node,accepted;if(sscanf(line,"A %16s %u %u",id,&node,&accepted)!=3||node>=9||node/5!=zone)return;for(byte i=0;i<12;i++){Pending&p=pending[i];if(p.active&&p.bay==node&&!strcmp(p.id,id)){p.active=false;if(accepted&&p.arrival)gateMove(entry,true);if(id[0]!='@')finish(id,accepted!=0);break;}}}
}
void readRadio(byte z){HardwareSerial&radio=z==0?Serial1:Serial2;while(radio.available()){char ch=radio.read();if(ch=='\n'){radioLine[z][radioLength[z]]=0;radioPacket(z,radioLine[z]);radioLength[z]=0;}else if((uint8_t)ch>=32&&(uint8_t)ch<=126){if(radioLength[z]<127)radioLine[z][radioLength[z]++]=ch;else radioLength[z]=0;}}}
void execute(char*line){char*id=strtok(line," "),*verb=strtok(NULL," "),*arg=strtok(NULL," "),*value=strtok(NULL," ");if(!id||!verb||strlen(id)>16)return;
 for(byte i=0;i<16;i++)if(!strcmp(results[i].id,id)){ack(id,results[i].accepted);return;}
 for(byte i=0;i<12;i++)if(pending[i].active&&!strcmp(pending[i].id,id))return;
 int bay=findBay(arg);bool accepted=false;
 if(!strcmp(verb,"ARRIVE")){bay=1;if(!emergency&&!gateFault&&healthy(bay)&&clearBay(bay)&&!strcmp(bays[bay].position,"UP")&&request(id,bay,'U',arg?atol(arg):600000,true))return;}
 else if(!strcmp(verb,"UNLOCK")){if(bay>=0&&!emergency&&!gateFault&&healthy(bay)&&clearBay(bay)&&!strcmp(bays[bay].position,"UP")&&request(id,bay,'U',value?atol(value):600000))return;}
 else if(!strcmp(verb,"ENTER")){if(bay>=0&&!emergency&&!gateFault&&healthy(bay)&&clearBay(bay)&&!strcmp(bays[bay].position,"DOWN")){gateMove(entry,true);accepted=true;}}
 else if(!strcmp(verb,"EXIT")){if(bay<0&&!arg)bay=1;if(bay>=0&&!emergency&&!gateFault&&healthy(bay)&&clearBay(bay)){gateMove(exitGate,true);accepted=true;}}
 else if(!strcmp(verb,"RESET")&&digitalRead(2)==LOW){if(bay>=0){if(!emergency&&fresh(bay)&&request(id,bay,'R',0))return;}else if(!arg){bool valid=asserted(entry.openPin)!=asserted(entry.closedPin)&&asserted(exitGate.openPin)!=asserted(exitGate.closedPin);for(byte i=0;i<9;i++)valid=valid&&fresh(i)&&!strcmp(bays[i].health,"HEALTHY");if(valid){emergency=false;gateFault=false;accepted=true;for(byte i=0;i<9;i++){char resetId[17];snprintf(resetId,17,"@n%lu%u",nowMs,i);request(resetId,i,'N',0);}}}}
 finish(id,accepted);
}
void fields(byte i,bool withId){Bay&b=bays[i];bool f=fresh(i);if(withId){usb.print(F("\"id\":\""));usb.print(IDS[i]);usb.print(F("\","));}usb.print(F("\"bay\":\""));usb.print(f?b.position:"UNKNOWN");usb.print(F("\",\"occupancy\":\""));usb.print(f?b.occupancy:"UNCERTAIN");usb.print(F("\",\"distance\":"));usb.print(f?b.distance:-1);usb.print(F(",\"health\":\""));usb.print(!withId&&gateFault?"GATE_FAULT":f?b.health:"RADIO_OFFLINE");usb.print(F("\",\"clearanceMs\":"));usb.print(f?b.clearance:0);}
void output(){if(nowMs<5000){for(byte i=0;i<9;i++)if(!bays[i].available)return;}if(nowMs-lastOutput<1000||usb.queued()>128)return;lastOutput=nowMs;usb.print(F("{\"kind\":\"telemetry\",\"seq\":"));usb.print(++sequence);usb.print(F(",\"ms\":"));usb.print(nowMs);usb.print(',');fields(1,false);usb.print(F(",\"entry\":\""));usb.print(gateName(entry));usb.print(F("\",\"exit\":\""));usb.print(gateName(exitGate));usb.print(F("\",\"emergency\":"));usb.print(emergency?1:0);usb.print(F(",\"entryBeam\":"));usb.print(asserted(3)?1:0);usb.print(F(",\"exitBeam\":"));usb.print(asserted(4)?1:0);usb.print(F(",\"transport\":\"SIMULATED_WIRELESS\",\"bays\":["));for(byte i=0;i<9;i++){if(i)usb.print(',');usb.print('{');fields(i,true);usb.print('}');}usb.println(F("]}"));}
void setup(){pinMode(2,INPUT_PULLUP);pinMode(3,INPUT_PULLUP);pinMode(4,INPUT_PULLUP);for(byte p=5;p<=8;p++)pinMode(p,INPUT_PULLUP);pinMode(11,OUTPUT);pinMode(12,OUTPUT);pinMode(13,OUTPUT);TCCR1A=_BV(COM1A1)|_BV(COM1B1)|_BV(WGM11);TCCR1B=_BV(WGM13)|_BV(WGM12)|_BV(CS11);ICR1=39999;OCR1A=1000;OCR1B=1000;Serial.begin(115200);Serial1.begin(115200);Serial2.begin(115200);}
void loop(){nowMs=millis();readRadio(0);readRadio(1);while(Serial.available()){char ch=Serial.read();if(ch=='\n'){input[inputLength]=0;execute(input);inputLength=0;}else if((uint8_t)ch>=32&&(uint8_t)ch<=126){if(inputLength<99)input[inputLength++]=ch;else inputLength=0;}}
 if(digitalRead(2)==HIGH&&!emergency){emergency=true;gateMove(entry,true);gateMove(exitGate,true);for(byte i=0;i<9;i++){char id[17];snprintf(id,17,"@e%lu%u",nowMs,i);request(id,i,'E',0);}}
 for(byte i=0;i<12;i++){Pending&p=pending[i];if(!p.active)continue;if(nowMs>p.deadline){p.active=false;if(p.id[0]!='@')finish(p.id,false);}else if(nowMs-p.lastSend>=500)transmit(p);}
 gateTick(entry);gateTick(exitGate);digitalWrite(13,emergency);output();usb.pump();
}
