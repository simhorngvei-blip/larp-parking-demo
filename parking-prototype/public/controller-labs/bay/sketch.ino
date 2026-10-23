// Six short-wire HC-SR04 channels. Installed addressed ceiling bus / RF remain reference-only.
#include <Arduino.h>
const int trigPins[6]={13,14,18,19,21,22},echoPins[6]={32,33,34,35,36,39};
bool forcedOff[6]={};unsigned channel=0,sequence=0;bool healthy[6]={};char command[64];int used=0;unsigned long nextRead=0;
void event(const char*result,const char*check,unsigned addr,const char*detail){Serial.printf("{\"role\":\"BAY_BENCH\",\"result\":\"%s\",\"check\":\"%s\",\"address\":%u,\"seq\":%u,\"detail\":\"%s\"}\n",result,check,addr,sequence,detail);}
void setup(){Serial.begin(115200);pinMode(2,OUTPUT);for(unsigned i=0;i<6;i++){pinMode(trigPins[i],OUTPUT);digitalWrite(trigPins[i],LOW);pinMode(echoPins[i],INPUT);}event("PASS","BOOT",0,"ESP32 six-sensor bench started");event("NOT_MEASURED","PHYSICAL_NETWORK",0,"No RF / RS485 / supply-voltage / bollard-position measurement");}
void loop(){
 while(Serial.available()){
  char b=Serial.read();if(b=='\n'){command[used]=0;char op[24];unsigned addr;
   if(sscanf(command,"%23s %u",op,&addr)==2&&addr>=1&&addr<=6&&(!strcmp(op,"SENSOR_OFF")||!strcmp(op,"SENSOR_ON"))){forcedOff[addr-1]=!strcmp(op,"SENSOR_OFF");event("INFO","FAULT_FIXTURE",addr,forcedOff[addr-1]?"Explicit software fixture enabled":"Explicit software fixture cleared");}
   else event("FAIL","INVALID_COMMAND",0,"Use SENSOR_OFF 1..6 or SENSOR_ON 1..6");used=0;
  }else if(b!='\r'){if(used<63)command[used++]=b;else{used=0;event("FAIL","COMMAND_OVERFLOW",0,"Oversized command discarded");}}
 }
 if((long)(millis()-nextRead)>=0){
  ++sequence;unsigned i=channel;digitalWrite(trigPins[i],LOW);delayMicroseconds(2);digitalWrite(trigPins[i],HIGH);delayMicroseconds(10);digitalWrite(trigPins[i],LOW);
  unsigned long duration=pulseIn(echoPins[i],HIGH,30000);float cm=duration/58.0;healthy[i]=!forcedOff[i]&&duration>0&&cm>=2&&cm<=450;
  if(healthy[i])Serial.printf("{\"role\":\"BAY_BENCH\",\"result\":\"PASS\",\"check\":\"SENSOR_SAMPLE\",\"address\":%u,\"seq\":%u,\"cm\":%.1f,\"occupancy\":\"%s\"}\n",i+1,sequence,cm,cm<120?"PRESENT":"CLEAR");
  else event("FAIL","SENSOR_SAMPLE",i+1,forcedOff[i]?"Explicit software sensor-off fixture; occupancy UNKNOWN":"Missing/out-of-range echo; occupancy UNKNOWN; cause unconfirmed");
  bool all=true;for(bool h:healthy)all&=h;digitalWrite(2,all?HIGH:LOW);channel=(channel+1)%6;nextRead=millis()+70;
 }
 delay(1);
}
