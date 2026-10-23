// Ideal addressed UART peripheral model, NOT eight ESP32 CPUs or an electrical RS-485 transceiver.
#include "wokwi-api.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
typedef struct {uart_dev_t uart;pin_t de;uint32_t offline;char input[80],reply[80];int used;} Bus;
static unsigned checksum(unsigned addr,unsigned seq){return (addr^seq^0x5a)&255;}
static void rx(void *data,uint8_t b){Bus*s=data;if(!pin_read(s->de)){s->used=0;return;}if(b=='\n'){
 s->input[s->used]=0;unsigned addr,seq,crc;if(sscanf(s->input,"P %u %u %u",&addr,&seq,&crc)==3&&addr>=1&&addr<=8&&crc==checksum(addr,seq)&&addr!=attr_read(s->offline))snprintf(s->reply,sizeof(s->reply),"A %u %u %u\n",addr,seq,checksum(addr,seq));s->used=0;
 }else if(b!='\r'){if(s->used<79)s->input[s->used++]=b;else s->used=0;}}
static void tick(void*data){Bus*s=data;if(!pin_read(s->de)&&s->reply[0]&&uart_write(s->uart,(uint8_t*)s->reply,strlen(s->reply)))s->reply[0]=0;}
void chip_init(void){Bus*s=calloc(1,sizeof(Bus));s->offline=attr_init("offlineAddress",0);s->de=pin_init("DE",INPUT);pin_init("VCC",INPUT);pin_init("GND",INPUT);const uart_config_t u={.rx=pin_init("RX",INPUT),.tx=pin_init("TX",INPUT_PULLUP),.baud_rate=19200,.rx_data=rx,.user_data=s};s->uart=uart_init(&u);const timer_config_t t={.callback=tick,.user_data=s};timer_t timer=timer_init(&t);timer_start(timer,1000,true);}
