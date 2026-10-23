// Ideal mechanical plant. The visible parking barrier observes STEP/DIR;
// its end switches and image are independent of app commands.
#include "wokwi-api.h"
#include <stdlib.h>
#include <stdbool.h>
typedef struct {pin_t step,dir,enable,down,up,echo,pwm[2],opened[2],closed[2];uint32_t jam;int position;bool target[2],moving[2],occupied,dirty;uint64_t rise[2],settle[2],echoRise,lastDraw;buffer_t frame;uint8_t pixels[160*150*4];} chip_state_t;
static void rect(chip_state_t* c,int x,int y,int w,int h,int r,int g,int b){for(int yy=y;yy<y+h&&yy<150;yy++)for(int xx=x;xx<x+w&&xx<160;xx++){if(xx<0||yy<0)continue;int p=(yy*160+xx)*4;c->pixels[p]=r;c->pixels[p+1]=g;c->pixels[p+2]=b;c->pixels[p+3]=255;}}
static void draw(chip_state_t* c){
 rect(c,0,0,160,150,230,239,232);rect(c,8,8,144,134,255,255,255);rect(c,13,13,134,4,c->position==100?39:190,c->position==100?151:68,80);
 // Painted bay outline and a car only when the actual echo indicates presence.
 rect(c,28,27,3,102,186,203,190);rect(c,129,27,3,102,186,203,190);rect(c,28,27,104,3,186,203,190);
 if(c->occupied){rect(c,57,37,48,67,44,94,135);rect(c,62,42,38,14,161,206,219);rect(c,62,85,38,12,161,206,219);rect(c,52,46,5,13,28,43,48);rect(c,105,46,5,13,28,43,48);rect(c,52,81,5,13,28,43,48);rect(c,105,81,5,13,28,43,48);}
 // A raised red U-bar physically shrinks toward its base as the stepper lowers.
 int lift=(100-c->position)*55/100,top=122-lift;rect(c,48,122,64,10,73,86,81);rect(c,55,top,8,lift+5,199,61,62);rect(c,98,top,8,lift+5,199,61,62);rect(c,55,top,51,9,199,61,62);rect(c,67,top+2,10,5,249,228,180);rect(c,86,top+2,10,5,249,228,180);
 rect(c,16,135,c->position*128/100,4,42,156,110);if(attr_read(c->jam))rect(c,136,20,9,9,230,153,42);
 buffer_write(c->frame,0,c->pixels,sizeof(c->pixels));c->dirty=false;c->lastDraw=get_sim_nanos();
}
static void limits(chip_state_t* c){pin_write(c->down,c->position==100?LOW:HIGH);pin_write(c->up,c->position==0?LOW:HIGH);}
static void changed(void* data,pin_t pin,uint32_t value){chip_state_t* c=data;
 if(pin==c->step&&value==HIGH&&!attr_read(c->jam)){c->position+=pin_read(c->dir)==HIGH?1:-1;if(c->position<0)c->position=0;if(c->position>100)c->position=100;limits(c);c->dirty=true;return;}
 if(pin==c->echo){if(value==HIGH)c->echoRise=get_sim_nanos();else{bool occupied=(get_sim_nanos()-c->echoRise)/1000<50*58;if(occupied!=c->occupied){c->occupied=occupied;c->dirty=true;}}return;}
 for(int i=0;i<2;i++)if(pin==c->pwm[i]){if(value==HIGH)c->rise[i]=get_sim_nanos();else{uint64_t width=(get_sim_nanos()-c->rise[i])/1000;if(width<400||width>2400)return;bool open=width>1000;if(open!=c->target[i]){c->target[i]=open;c->moving[i]=true;c->settle[i]=get_sim_nanos()+600000000ULL;pin_write(c->opened[i],HIGH);pin_write(c->closed[i],HIGH);}}}
}
static void tick(void* data){chip_state_t* c=data;pin_write(c->enable,attr_read(c->jam)?HIGH:LOW);for(int i=0;i<2;i++)if(c->moving[i]&&get_sim_nanos()>=c->settle[i]){c->moving[i]=false;pin_write(c->opened[i],c->target[i]?LOW:HIGH);pin_write(c->closed[i],c->target[i]?HIGH:LOW);}if(c->dirty&&get_sim_nanos()-c->lastDraw>40000000ULL)draw(c);}
void chip_init(){chip_state_t* c=calloc(1,sizeof(chip_state_t));c->step=pin_init("STEP",INPUT_PULLDOWN);c->dir=pin_init("DIR",INPUT_PULLDOWN);c->echo=pin_init("ECHO",INPUT_PULLDOWN);c->enable=pin_init("ENABLE",OUTPUT_LOW);c->down=pin_init("DOWN",OUTPUT_HIGH);c->up=pin_init("UP",OUTPUT_LOW);c->jam=attr_init("jam",0);c->position=attr_read(attr_init("initial",0));
 c->pwm[0]=pin_init("ENTRY_PWM",INPUT_PULLDOWN);c->pwm[1]=pin_init("EXIT_PWM",INPUT_PULLDOWN);c->opened[0]=pin_init("ENTRY_OPEN",OUTPUT_HIGH);c->closed[0]=pin_init("ENTRY_CLOSED",OUTPUT_LOW);c->opened[1]=pin_init("EXIT_OPEN",OUTPUT_HIGH);c->closed[1]=pin_init("EXIT_CLOSED",OUTPUT_LOW);pin_init("GND",INPUT);
 const pin_watch_config_t watch={.edge=BOTH,.pin_change=changed,.user_data=c};pin_watch(c->step,&watch);pin_watch(c->echo,&watch);pin_watch(c->pwm[0],&watch);pin_watch(c->pwm[1],&watch);
 uint32_t width,height;c->frame=framebuffer_init(&width,&height);limits(c);draw(c);const timer_config_t config={.callback=tick,.user_data=c};timer_t timer=timer_init(&config);timer_start(timer,2000,true);
}
