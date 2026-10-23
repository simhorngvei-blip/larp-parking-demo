// Independent bay receiver/controller model. Local STEP/DIR and sensors only.
// UART RX/TX are the simulator's ideal packet channel, not physical RF wiring.
#include "wokwi-api.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
enum {P_UP,P_DOWN,P_LOWER,P_RAISE,P_UNKNOWN};
typedef struct {char id[17];char op;int accepted;uint32_t deadline,hold;} Seen;
typedef struct {pin_t step,dir,down,up,trig,echo;uint32_t node,offline;uart_dev_t uart;int state,distance;bool initialized,occupied,emergency,clearTrack,presentTrack,limitTrack;uint32_t clearAt,presentAt,moveAt,limitAt,lastStep,lastSample,lastReport,lastEcho,holdAt,holdMs,seq;uint64_t echoRise;const char*health;char input[100];int length;Seen seen[16];int seenAt;char queue[20][128];int head,tail;uint8_t sending[128];} Node;
static uint32_t ms(void){return get_sim_nanos()/1000000ULL;}
static bool asserted(pin_t p){return pin_read(p)==LOW;}
static const char* position(Node*n){const char*names[]={"UP","DOWN","MOVING_DOWN","MOVING_UP","UNKNOWN"};return names[n->state];}
static const char* occupancy(Node*n){return n->distance>150?"CLEAR":n->distance>=0&&n->distance<50?(n->presentTrack&&ms()-n->presentAt>=3000?"PRESENT":"DETECTING"):"UNCERTAIN";}
static void queue(Node*n,const char*s){int next=(n->tail+1)%20;if(next==n->head)return;strncpy(n->queue[n->tail],s,127);n->queue[n->tail][127]=0;n->tail=next;}
static void flush(Node*n){if(n->head==n->tail||attr_read(n->offline))return;if(uart_write(n->uart,(uint8_t*)n->queue[n->head],strlen(n->queue[n->head])))n->head=(n->head+1)%20;}
static void ack(Node*n,const char*id,int accepted){char line[80];snprintf(line,sizeof(line),"A %s %u %d\n",id,attr_read(n->node),accepted);queue(n,line);}
static void fail(Node*n,const char*reason){n->health=reason;n->state=P_UNKNOWN;pin_write(n->step,LOW);}
static void move(Node*n,bool down){n->state=down?P_LOWER:P_RAISE;pin_write(n->dir,down?HIGH:LOW);n->moveAt=ms();n->lastStep=ms();n->limitTrack=false;}
static bool reset(Node*n){if(asserted(n->down)==asserted(n->up)||!(n->distance>150||(n->distance>=0&&n->distance<50)))return false;n->state=asserted(n->down)?P_DOWN:P_UP;n->health="HEALTHY";n->occupied=n->distance<50;n->clearTrack=false;n->holdAt=ms()-n->holdMs;return true;}
static void command(Node*n,char*line){char id[17],op;unsigned node,deadline,hold;if(sscanf(line,"C %16s %u %c %u %u",id,&node,&op,&deadline,&hold)!=5||node!=attr_read(n->node))return;
 for(int i=0;i<16;i++)if(!strcmp(n->seen[i].id,id)){Seen*s=&n->seen[i];ack(n,id,s->op==op&&s->deadline==deadline&&s->hold==hold?s->accepted:0);return;}
 bool accepted=false;uint32_t now=ms();
 if(deadline>=now&&deadline-now<=8000&&n->initialized){
  if(op=='U'&&!n->emergency&&!strcmp(n->health,"HEALTHY")&&n->distance>150&&n->state==P_UP&&hold>=5000&&hold<=600000){n->occupied=false;n->holdMs=hold;n->clearTrack=false;move(n,true);accepted=true;}
  if(op=='R'&&!n->emergency)accepted=reset(n);
  if(op=='E'){n->emergency=true;if(!strcmp(n->health,"HEALTHY")&&n->state!=P_DOWN)move(n,true);accepted=true;}
  if(op=='N'&&reset(n)){n->emergency=false;accepted=true;}
 }
 Seen*s=&n->seen[n->seenAt];strcpy(s->id,id);s->op=op;s->deadline=deadline;s->hold=hold;s->accepted=accepted;n->seenAt=(n->seenAt+1)%16;ack(n,id,accepted);
}
static void received(void*data,uint8_t b){Node*n=data;if(attr_read(n->offline)){n->length=0;return;}if(b=='\n'){n->input[n->length]=0;command(n,n->input);n->length=0;}else if(b!='\r'){if(n->length<99)n->input[n->length++]=b;else n->length=0;}}
static void echoChanged(void*data,pin_t pin,uint32_t v){Node*n=data;if(v)n->echoRise=get_sim_nanos();else{n->distance=(get_sim_nanos()-n->echoRise)/58000ULL;n->lastEcho=ms();}}
static void tick(void*data){Node*n=data;uint32_t now=ms();pin_write(n->step,LOW);pin_write(n->trig,LOW);
 if(now-n->lastSample>=200){n->lastSample=now;pin_write(n->trig,HIGH);}
 if(now-n->lastEcho>700)n->distance=-1;
 bool clear=n->distance>150,present=n->distance>=0&&n->distance<50;
 if(clear){if(!n->clearTrack){n->clearTrack=true;n->clearAt=now;}}else n->clearTrack=false;
 if(present){if(!n->presentTrack){n->presentTrack=true;n->presentAt=now;}}else n->presentTrack=false;
 if(!n->initialized&&now>600){n->initialized=true;if(!reset(n))fail(n,"POSITION_FAULT");}
 if(n->initialized){
  if(asserted(n->up)&&asserted(n->down))fail(n,"POSITION_FAULT");
  if(!strcmp(n->health,"HEALTHY")&&!clear&&!present)fail(n,"SENSOR_FAULT");
  if(n->state==P_LOWER||n->state==P_RAISE){
   if(n->state==P_RAISE&&!clear)fail(n,"SENSOR_FAULT");else{
    bool reached=asserted(n->state==P_LOWER?n->down:n->up);
    if(reached){if(!n->limitTrack){n->limitTrack=true;n->limitAt=now;}if(now-n->limitAt>=50){n->state=n->state==P_LOWER?P_DOWN:P_UP;n->holdAt=now;n->clearTrack=false;}}
    else{n->limitTrack=false;if(now-n->lastStep>=6){n->lastStep=now;pin_write(n->step,HIGH);}}
    if((n->state==P_LOWER||n->state==P_RAISE)&&now-n->moveAt>8000)fail(n,"MOTOR_FAULT");
   }
  }
  if(n->presentTrack&&now-n->presentAt>=3000)n->occupied=true;
  if(n->state==P_DOWN&&!strcmp(n->health,"HEALTHY")&&!n->emergency&&n->clearTrack&&now-n->clearAt>=10000&&(n->occupied||now-n->holdAt>=n->holdMs))move(n,false);
  if(!strcmp(n->health,"HEALTHY")&&((n->state==P_UP&&!asserted(n->up))||(n->state==P_DOWN&&!asserted(n->down))))fail(n,"POSITION_FAULT");
 }
 if(now-n->lastReport>=1000+attr_read(n->node)*23){n->lastReport=now;if(!attr_read(n->offline)){char line[128];snprintf(line,sizeof(line),"T %u %u %s %d %s %s %u\n",attr_read(n->node),++n->seq,position(n),n->distance,occupancy(n),n->health,n->clearTrack?now-n->clearAt:0);queue(n,line);}}
 if(attr_read(n->offline))n->head=n->tail;flush(n);
}
void chip_init(void){Node*n=calloc(1,sizeof(Node));n->node=attr_init("node",0);n->offline=attr_init("offline",0);n->distance=-1;n->state=P_UNKNOWN;n->health="HEALTHY";n->holdMs=600000;
 n->step=pin_init("STEP",OUTPUT_LOW);n->dir=pin_init("DIR",OUTPUT_LOW);n->down=pin_init("DOWN",INPUT_PULLUP);n->up=pin_init("UP",INPUT_PULLUP);n->trig=pin_init("TRIG",OUTPUT_LOW);n->echo=pin_init("ECHO",INPUT_PULLDOWN);pin_init("VCC",OUTPUT_HIGH);pin_init("GND",OUTPUT_LOW);
 const pin_watch_config_t watch={.edge=BOTH,.pin_change=echoChanged,.user_data=n};pin_watch(n->echo,&watch);
 const uart_config_t uart={.rx=pin_init("RX",INPUT),.tx=pin_init("TX",INPUT_PULLUP),.baud_rate=115200,.rx_data=received,.user_data=n};n->uart=uart_init(&uart);
 const timer_config_t timer={.callback=tick,.user_data=n};timer_t t=timer_init(&timer);timer_start(t,2000,true);
}
