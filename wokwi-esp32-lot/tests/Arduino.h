#pragma once
#include <cstdint>
#include <cstddef>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <string>
#include <deque>
#include <map>
#include <initializer_list>
using byte=uint8_t;
#define F(s) s
#define HIGH 1
#define LOW 0
#define INPUT_PULLUP 2
#define OUTPUT 3
#define SERIAL_8N1 0
inline unsigned long fakeMillis=0;inline int levels[40];inline std::map<int,uint32_t> pwm;inline bool pwmReady=true;
inline void pinMode(int,int){}inline int digitalRead(int p){return levels[p];}inline void digitalWrite(int p,int v){levels[p]=v;}inline unsigned long millis(){return fakeMillis;}inline void delay(unsigned long ms){fakeMillis+=ms;}
inline bool ledcAttach(int,int freq,int bits){return pwmReady&&freq==50&&bits==16;}inline bool ledcWrite(int p,uint32_t duty){pwm[p]=duty;return pwmReady;}
class Print{public:virtual ~Print()=default;virtual size_t write(uint8_t)=0;void print(const char*s){while(*s)write(*s++);}void print(char*s){print(static_cast<const char*>(s));}void print(char c){write(c);}template<class T>void print(T n){const auto s=std::to_string(n);print(s.c_str());}template<class T>void println(T n){print(n);write('\n');}};
class HardwareSerial:public Print{public:std::deque<uint8_t>rx;std::string tx;int rxPin=-1,txPin=-1;void begin(int,int=0,int r=-1,int t=-1){rxPin=r;txPin=t;}void setRxBufferSize(int){}int available(){return rx.size();}int read(){int c=rx.front();rx.pop_front();return c;}int availableForWrite(){return 64;}size_t write(uint8_t c)override{tx+=char(c);return 1;}void inject(const std::string&s){for(auto c:s)rx.push_back(c);}};
inline HardwareSerial Serial,Serial1,Serial2;
