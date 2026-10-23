// Five-peer packet switch used ONLY as an ideal RF-medium/gateway model.
// AIR_* links are hidden simulator connections, never physical wiring advice.
#include "wokwi-api.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
typedef struct Gateway Gateway;
typedef struct {Gateway*g;int slot;uart_dev_t uart;char input[128],sending[128],queue[48][128];int length,head,tail;} Link;
struct Gateway {Link master,peer[5];uint32_t zone,offline;};
static void queue(Link*l,const char*s){int next=(l->tail+1)%48;if(next==l->head)return;strncpy(l->queue[l->tail],s,127);l->queue[l->tail][127]=0;l->tail=next;}
static void received(void*data,uint8_t b){Link*l=data;Gateway*g=l->g;if(attr_read(g->offline)){l->length=0;return;}if(b=='\n'){l->input[l->length]=0;char line[130];snprintf(line,sizeof(line),"%s\n",l->input);
 if(l->slot<0){char id[17],op;unsigned node,deadline,hold;if(sscanf(l->input,"C %16s %u %c %u %u",id,&node,&op,&deadline,&hold)==5&&node/5==attr_read(g->zone)&&node<9)queue(&g->peer[node%5],line);}
 else{unsigned node;bool valid=false;if(l->input[0]=='T')valid=sscanf(l->input,"T %u",&node)==1;else if(l->input[0]=='A'){char id[17];valid=sscanf(l->input,"A %16s %u",id,&node)==2;}if(valid&&node==attr_read(g->zone)*5+l->slot)queue(&g->master,line);}
 l->length=0;
 }else if(b!='\r'){if(l->length<127)l->input[l->length++]=b;else l->length=0;}}
static void tick(void*data){Gateway*g=data;for(int i=-1;i<5;i++){Link*l=i<0?&g->master:&g->peer[i];if(attr_read(g->offline)){l->head=l->tail;continue;}if(l->head==l->tail)continue;if(uart_write(l->uart,(uint8_t*)l->queue[l->head],strlen(l->queue[l->head])))l->head=(l->head+1)%48;}}
void chip_init(void){Gateway*g=calloc(1,sizeof(Gateway));g->zone=attr_init("zone",0);g->offline=attr_init("offline",0);pin_init("VCC",INPUT);pin_init("GND",INPUT);
 for(int i=-1;i<5;i++){Link*l=i<0?&g->master:&g->peer[i];l->g=g;l->slot=i;char rx[16],tx[16];if(i<0){strcpy(rx,"RX");strcpy(tx,"TX");}else{snprintf(rx,sizeof(rx),"AIR_RX%d",i);snprintf(tx,sizeof(tx),"AIR_TX%d",i);}const uart_config_t uart={.rx=pin_init(rx,INPUT),.tx=pin_init(tx,INPUT_PULLUP),.baud_rate=115200,.rx_data=received,.user_data=l};l->uart=uart_init(&uart);}
 const timer_config_t timer={.callback=tick,.user_data=g};timer_t t=timer_init(&timer);timer_start(t,2000,true);
}
