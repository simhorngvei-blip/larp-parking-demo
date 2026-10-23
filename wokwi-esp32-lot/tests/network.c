// Platform fixture: executes the real custom-chip C code with GPIO, time and
// delayed UART transport. Only mechanics and simulator API are supplied here.
#include "wokwi-api.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
void node_init(void);void gateway_init(void);
typedef struct {char name[24];int owner;uint32_t value;pin_watch_config_t watch;} Pin;
typedef struct {char name[24];int owner;uint32_t value;} Attr;
typedef struct {timer_config_t cfg;uint64_t next,period;bool repeat;} Timer;
typedef struct {uart_config_t cfg;int owner;} Uart;
static Pin pins[400];static Attr attrs[100];static Timer timers[100];static Uart uarts[40];
static int np,na,nt,nu,owner;static uint64_t clockNs;
static int positions[9],steps[9],distance[9],jam[9];
static struct {int uart;uint64_t at;char text[256];} packets[2048];static int queued;
static char output[200000];static int outlen;
static int lookup(int o,const char*n){for(int i=0;i<np;i++)if(pins[i].owner==o&&!strcmp(pins[i].name,n))return i;return -1;}
static void input(int p,int v){if(p<0)return;int old=pins[p].value;pins[p].value=v;if(old!=v&&pins[p].watch.pin_change)pins[p].watch.pin_change(pins[p].watch.user_data,p,v);}
pin_t pin_init(const char*n,uint32_t mode){int p=np++;strncpy(pins[p].name,n,23);pins[p].owner=owner;pins[p].value=mode==INPUT_PULLUP||mode==OUTPUT_HIGH;return p;}
void pin_write(pin_t p,uint32_t v){int old=pins[p].value;input(p,v);int i=pins[p].owner;if(i<9&&!strcmp(pins[p].name,"STEP")&&!old&&v&&!jam[i]){positions[i]+=pins[lookup(i,"DIR")].value?1:-1;if(positions[i]<0)positions[i]=0;if(positions[i]>100)positions[i]=100;steps[i]++;input(lookup(i,"DOWN"),positions[i]!=100);input(lookup(i,"UP"),positions[i]!=0);}}
uint32_t pin_read(pin_t p){return pins[p].value;}void pin_watch(pin_t p,const pin_watch_config_t*c){pins[p].watch=*c;}
uint32_t attr_init(const char*n,uint32_t v){int a=na++;attrs[a].owner=owner;strncpy(attrs[a].name,n,23);attrs[a].value=!strcmp(n,"node")?owner:!strcmp(n,"zone")?owner-20:v;return a;}
uint32_t attr_read(uint32_t a){return attrs[a].value;}uint64_t get_sim_nanos(void){return clockNs;}
timer_t timer_init(const timer_config_t*c){int t=nt++;timers[t].cfg=*c;return t;}void timer_start(timer_t t,uint32_t us,bool repeat){timers[t].period=(uint64_t)us*1000;timers[t].next=clockNs+timers[t].period;timers[t].repeat=repeat;}void timer_stop(timer_t t){timers[t].next=0;}
uart_dev_t uart_init(const uart_config_t*c){int u=nu++;uarts[u].cfg=*c;uarts[u].owner=owner;return u;}
bool uart_write(uart_dev_t u,uint8_t*b,uint32_t n){if(queued>=2048||n>=256)abort();packets[queued].uart=u;packets[queued].at=clockNs+20000000;memcpy(packets[queued].text,b,n);packets[queued++].text[n]=0;return true;}
buffer_t framebuffer_init(uint32_t*w,uint32_t*h){*w=160;*h=80;return 0;}void buffer_write(buffer_t b,uint32_t a,const void*p,uint32_t n){}
static void deliver(int u,const char*s){for(;*s;s++)if(uarts[u].cfg.rx_data)uarts[u].cfg.rx_data(uarts[u].cfg.user_data,*s);}
static int findUart(int o,const char*rx){for(int i=0;i<nu;i++)if(uarts[i].owner==o&&!strcmp(pins[uarts[i].cfg.rx].name,rx))return i;return -1;}
static void command(int zone,const char*s){deliver(findUart(20+zone,"RX"),s);}
static void setAttr(int o,const char*n,int v){for(int i=0;i<na;i++)if(attrs[i].owner==o&&!strcmp(attrs[i].name,n))attrs[i].value=v;}
static void run(int ms){uint64_t end=clockNs+(uint64_t)ms*1000000;while(clockNs<end){clockNs+=100000;
 for(int i=0;i<9;i++){int e=lookup(i,"ECHO");uint64_t phase=(clockNs/1000)%20000;input(e,phase>=1000&&phase<1000+(uint64_t)distance[i]*58);}
 for(int i=0;i<nt;i++)if(timers[i].next&&clockNs>=timers[i].next){if(timers[i].repeat)timers[i].next+=timers[i].period;else timers[i].next=0;timers[i].cfg.callback(timers[i].cfg.user_data);}
 for(int p=0;p<queued;){if(packets[p].at>clockNs){p++;continue;}char text[256];strcpy(text,packets[p].text);int u=packets[p].uart,o=uarts[u].owner;packets[p]=packets[--queued];const char*tx=pins[uarts[u].cfg.tx].name;
 if(o<9){int zone=o/5,slot=o%5;char rx[12];sprintf(rx,"AIR_RX%d",slot);deliver(findUart(20+zone,rx),text);}
 else if(!strcmp(tx,"TX")){int len=strlen(text);if(outlen+len<sizeof(output)){memcpy(output+outlen,text,len+1);outlen+=len;}}
 else{int slot=atoi(tx+6);int node=(o-20)*5+slot;if(node<9)deliver(findUart(node,"RX"),text);}
 if(uarts[u].cfg.write_done)uarts[u].cfg.write_done(uarts[u].cfg.user_data);
 }
}}
int main(){for(int i=0;i<9;i++){owner=i;distance[i]=250;node_init();input(lookup(i,"DOWN"),1);input(lookup(i,"UP"),0);}for(int z=0;z<2;z++){owner=20+z;gateway_init();}run(1500);
 command(0,"C a 1 U 9000 600000\n");run(2000);printf("target %d %d %d %d %d\n",positions[0],positions[1],positions[2],positions[3],positions[4]);
 int before=steps[1];command(0,"C a 1 U 9000 600000\n");run(100);printf("duplicate %d\n",steps[1]-before);
 command(0,"C wrong 7 U 9000 600000\n");command(0,"C old 3 U 1 600000\n");run(1000);printf("reject %d %d\n",positions[7],positions[3]);
 distance[1]=30;run(3500);command(0,"C occupied 1 U 12000 600000\n");run(200);printf("occupied %d\n",positions[1]);
 distance[1]=250;run(11500);printf("relock %d\n",positions[1]);
 setAttr(2,"offline",1);command(0,"C lost 2 U 25000 600000\n");run(1000);printf("offline %d\n",positions[2]);
 jam[4]=1;command(0,"C jam 4 U 26000 600000\n");run(9000);printf("jam %d %d\n",positions[4],positions[0]);
 command(1,"C second 7 U 35000 600000\n");run(2000);printf("zoneB %d %d\n",positions[7],positions[6]);
 printf("frames\n%s",output);return 0;}
