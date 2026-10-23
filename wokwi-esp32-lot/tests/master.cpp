#include <cassert>
#include <iostream>
#include "../firmware/esp32_master/esp32_master.ino"
void command(const char*s){char line[100];strcpy(line,s);execute(line);usb.pump();}
int main(int argc,char**){
 for(auto&v:levels)v=HIGH;levels[EMERGENCY]=LOW;levels[ENTRY_CLOSED]=LOW;levels[EXIT_CLOSED]=LOW;
 if(argc>1){pwmReady=false;setup();assert(gateFault);std::cout<<"PASS PWM startup failure is a gate fault\n";return 0;}
 setup();assert(Serial1.rxPin==25&&Serial1.txPin==26&&Serial2.rxPin==16&&Serial2.txPin==17);assert(pwm[18]==1638&&pwm[19]==1638);
 fakeMillis=1100;loop();assert(Serial.tx.empty());
 for(int i=0;i<9;i++){const std::string report="T "+std::to_string(i)+" 1 UP 250 CLEAR HEALTHY 500\n";(i<5?Serial1:Serial2).inject(report);}loop();for(int i=0;i<9;i++)assert(healthy(i));assert(Serial.tx.find("\"controller\":\"ESP32\"")!=std::string::npos);
 const auto zoneA=Serial1.tx;command("unlock UNLOCK V-02 600000");assert(Serial1.tx==zoneA);assert(Serial2.tx.find("C unlock 5 U ")!=std::string::npos);assert(strcmp(bays[5].position,"UP")==0);
 char reply[]="A unlock 5 1";radioPacket(1,reply);usb.pump();assert(Serial.tx.find("\"id\":\"unlock\",\"accepted\":1")!=std::string::npos);assert(strcmp(bays[5].position,"UP")==0);
 const auto radio=Serial2.tx;command("unlock UNLOCK V-02 600000");assert(Serial2.tx==radio);
 command("unsafe ENTER V-02");assert(!entry.target&&pwm[18]==1638);
 char wrongZone[]="T 5 2 DOWN 250 CLEAR HEALTHY 500";radioPacket(0,wrongZone);assert(strcmp(bays[5].position,"UP")==0);radioPacket(1,wrongZone);command("enter ENTER V-02");assert(entry.target&&pwm[18]==4915&&strcmp(gateName(entry),"OPENING")==0);
 levels[ENTRY_OPEN]=LOW;levels[ENTRY_CLOSED]=HIGH;fakeMillis=1800;loop();assert(strcmp(gateName(entry),"OPEN")==0);
 fakeMillis=5800;loop();assert(!fresh(5));const auto previous=Serial2.tx;command("stale UNLOCK V-03 600000");assert(Serial2.tx==previous);
 levels[EMERGENCY]=HIGH;fakeMillis=5900;loop();assert(emergency&&pwm[18]==4915&&pwm[19]==4915);int emergencies=0;for(auto&p:pending)if(p.active&&p.op=='E')emergencies++;assert(emergencies==9);
 std::cout<<"PASS ESP32 master routing, discovery, independent feedback, duplicate handling, zone validation, stale rejection and emergency\n";
}
