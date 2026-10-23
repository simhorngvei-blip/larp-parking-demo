// LARP isolated flow-controller bench. Real ESP32 CPU; eight peripheral peer models.
// GPIO17/16/4 match the upstream reference UART/direction allocation.
// Ethernet, physical A/B levels, power rails and RF are NOT measured.
#include <Arduino.h>
HardwareSerial backbone(2);
const int ledPins[8]={13,14,18,19,21,22,25,26};
unsigned sequence=0,address=1;char input[80];int used=0;unsigned long nextPoll=0,deadline=0;bool waiting=false;
unsigned checksum(unsigned addr,unsigned seq){return (addr^seq^0x5a)&255;}
void report(const char*result,const char*check,unsigned addr,const char*detail){Serial.printf("{\"role\":\"FLOW_BENCH\",\"result\":\"%s\",\"check\":\"%s\",\"address\":%u,\"seq\":%u,\"detail\":\"%s\"}\n",result,check,addr,sequence,detail);}
void advance(){waiting=false;address=address%8+1;nextPoll=millis()+40;}
void setup(){Serial.begin(115200);pinMode(4,OUTPUT);digitalWrite(4,LOW);pinMode(32,INPUT_PULLUP);for(int p:ledPins){pinMode(p,OUTPUT);digitalWrite(p,LOW);}backbone.begin(19200,SERIAL_8N1,16,17);report("PASS","BOOT",0,"ESP32 firmware started; isolated bench");report("NOT_MEASURED","PHYSICAL_NETWORK",0,"No Ethernet / RS485 electrical / RF / rail-voltage measurement");}
void loop(){
 while(backbone.available()){
  char b=backbone.read();if(b=='\n'){input[used]=0;unsigned addr,seq,crc;
   if(waiting&&sscanf(input,"A %u %u %u",&addr,&seq,&crc)==3&&addr==address&&seq==sequence&&crc==checksum(addr,seq)){digitalWrite(ledPins[address-1],HIGH);report("PASS","PEER_REPLY",address,"Matching address, sequence and XOR checksum; peripheral MODEL");advance();}
   else report("FAIL","REPLY_VALIDATION",address,"Unexpected, stale or corrupt reply; not accepted");used=0;
  }else if(b!='\r'){if(used<79)input[used++]=b;else{used=0;report("FAIL","RX_OVERFLOW",address,"Oversized reply discarded");}}
 }
 if(waiting&&(long)(millis()-deadline)>=0){digitalWrite(ledPins[address-1],LOW);report("FAIL","PEER_TIMEOUT",address,"No accepted reply; cause unconfirmed");advance();}
 if(!waiting&&(long)(millis()-nextPoll)>=0){++sequence;digitalWrite(4,HIGH);backbone.printf("P %u %u %u\n",address,sequence,checksum(address,sequence));backbone.flush();digitalWrite(4,LOW);waiting=true;deadline=millis()+150;}
 static int last=-1;int link=digitalRead(32);if(link!=last){last=link;report(link?"PASS":"FAIL","UPSTREAM_INPUT_FIXTURE",0,link?"Switch reports available; not an Ethernet test":"Switch reports unavailable; bench fixture only");}
 delay(1);
}
