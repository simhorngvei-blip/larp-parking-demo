#include <Arduino.h>
#include "control.h"
// Actual ESP32 firmware; RF commands, occupancy and supply are bench input fixtures.
using namespace larp;
constexpr uint8_t STEP=18,DIR=19,ENABLE=23,LIMIT_UP=32,LIMIT_DOWN=33;
constexpr uint8_t LOWER_BUTTON=13,RAISE_BUTTON=14,RESET_BUTTON=21,ESTOP=25;
constexpr uint8_t BC_OCCUPIED=26,SAFETY_LOOP=27,POWER_OK=4,LINK_OK=16;
constexpr uint8_t STATUS_UP=2,STATUS_DOWN=17,STATUS_FAULT=22;
BayControl bay;uint32_t seq=0,lastReport=0,lastStep=0;State previous=UNINITIALIZED;bool pressed[3]={};char input[48];unsigned length=0;
Inputs inputs(){Inputs i;i.up=digitalRead(LIMIT_UP)==LOW;i.down=digitalRead(LIMIT_DOWN)==LOW;i.occupied=digitalRead(BC_OCCUPIED)==HIGH;i.blocked=digitalRead(SAFETY_LOOP)==HIGH;i.powerGood=digitalRead(POWER_OK)==LOW;i.linkGood=digitalRead(LINK_OK)==LOW;i.emergency=digitalRead(ESTOP)==LOW;return i;}
void event(const char*check,const char*result,const char*detail){Serial.printf("{\"role\":\"BOLLARD_BENCH\",\"address\":1,\"seq\":%lu,\"ms\":%lu,\"check\":\"%s\",\"result\":\"%s\",\"detail\":\"%s\"}\n",(unsigned long)++seq,(unsigned long)millis(),check,result,detail);}
void command(const char* text){Inputs i=inputs();bool ok=false;if(!strcmp(text,"LOWER"))ok=bay.request(true,i,millis());else if(!strcmp(text,"RAISE"))ok=bay.request(false,i,millis());else if(!strcmp(text,"RESET"))ok=bay.reset(i,millis());else{event("COMMAND","FAIL","Use LOWER, RAISE or RESET; buttons emulate authorized bench requests.");return;}event(text,ok?"PASS":"FAIL",ok?"Request accepted; position still requires end-stop feedback.":bay.rejection);}
void setup(){Serial.begin(115200);for(uint8_t p:{LIMIT_UP,LIMIT_DOWN,LOWER_BUTTON,RAISE_BUTTON,RESET_BUTTON,ESTOP,BC_OCCUPIED,SAFETY_LOOP,POWER_OK,LINK_OK})pinMode(p,INPUT_PULLUP);for(uint8_t p:{STEP,DIR,ENABLE,STATUS_UP,STATUS_DOWN,STATUS_FAULT})pinMode(p,OUTPUT);digitalWrite(ENABLE,HIGH);digitalWrite(STEP,LOW);delay(50);bay.tick(inputs(),millis());event("BOOT",bay.state==FAULT?"FAIL":"PASS","Independent single-bay ESP32 started; motor initially disabled.");event("PHYSICAL_RF_AND_POWER","NOT_MEASURED","Switches emulate upstream link, occupancy and power status; no RF or rail voltage measurement.");event("ACTUATOR_MODEL","NOT_MEASURED","A4988 stepper and ideal mechanics are bench surrogates, not production motor/load certification.");}
void loop(){
 const uint32_t now=millis();const Inputs i=inputs();bay.tick(i,now);
 while(Serial.available()){const char ch=Serial.read();if(ch=='\n'){input[length]=0;command(input);length=0;}else if(ch!='\r'&&length<sizeof(input)-1)input[length++]=ch;}
 const uint8_t buttons[]={LOWER_BUTTON,RAISE_BUTTON,RESET_BUTTON};const char* commands[]={"LOWER","RAISE","RESET"};for(unsigned b=0;b<3;b++){const bool down=digitalRead(buttons[b])==LOW;if(down&&!pressed[b])command(commands[b]);pressed[b]=down;}
 digitalWrite(STEP,LOW);digitalWrite(ENABLE,bay.motorEnabled()?LOW:HIGH);digitalWrite(DIR,bay.state==LOWERING?HIGH:LOW);
 if(bay.motorEnabled()&&now-lastStep>=8){lastStep=now;digitalWrite(STEP,HIGH);}
 digitalWrite(STATUS_UP,bay.state==UP);digitalWrite(STATUS_DOWN,bay.state==DOWN);digitalWrite(STATUS_FAULT,bay.state==FAULT);
 if(previous!=bay.state){previous=bay.state;event("POSITION_STATE",bay.state==FAULT?"FAIL":"INFO",bay.state==FAULT?bay.error:bay.name());}
 if(now-lastReport>=700){lastReport=now;Serial.printf("{\"role\":\"BOLLARD_BENCH\",\"address\":1,\"seq\":%lu,\"ms\":%lu,\"check\":\"TELEMETRY\",\"result\":\"%s\",\"position\":\"%s\",\"occupancy\":\"%s\",\"upLimit\":%d,\"downLimit\":%d,\"motorEnabled\":%d,\"powerFixture\":%d,\"linkFixture\":%d,\"safetyLoopClear\":%d,\"emergency\":%d,\"detail\":\"%s\"}\n",(unsigned long)++seq,(unsigned long)now,bay.state==FAULT?"FAIL":"PASS",bay.name(),i.linkGood?(i.occupied?"PRESENT":"CLEAR"):"UNKNOWN",i.up,i.down,bay.motorEnabled(),i.powerGood,i.linkGood,!i.blocked,i.emergency,bay.error);}
 delay(1);
}
