// Ideal digital movement model. It observes actual STEP/DIR and PWM wires.
// This is not a force, braking, current, or ultrasonic-coverage simulation.
#include "wokwi-api.h"
#include <stdlib.h>
#include <stdbool.h>
typedef struct {
 pin_t step,dir,enable,down,up,pwm[2],opened[2],closed[2];
 uint32_t jam;int position;bool target[2],moving[2];uint64_t rise[2],settle[2];
} chip_state_t;
static void update_limits(chip_state_t* c){pin_write(c->down,c->position==100?LOW:HIGH);pin_write(c->up,c->position==0?LOW:HIGH);}
static void changed(void* data,pin_t pin,uint32_t value){
 chip_state_t* c=data;
 if(pin==c->step&&value==HIGH&&attr_read(c->jam)==0){c->position+=pin_read(c->dir)==HIGH?1:-1;if(c->position<0)c->position=0;if(c->position>100)c->position=100;update_limits(c);return;}
 for(int i=0;i<2;i++)if(pin==c->pwm[i]){
  if(value==HIGH)c->rise[i]=get_sim_nanos();
  else {uint64_t width=(get_sim_nanos()-c->rise[i])/1000;if(width<400||width>2400)return;bool open=width>1000;
   if(open!=c->target[i]){c->target[i]=open;c->moving[i]=true;c->settle[i]=get_sim_nanos()+600000000ULL;pin_write(c->opened[i],HIGH);pin_write(c->closed[i],HIGH);}
  }
 }
}
static void tick(void* data){chip_state_t* c=data;pin_write(c->enable,attr_read(c->jam)>0?HIGH:LOW);for(int i=0;i<2;i++)if(c->moving[i]&&get_sim_nanos()>=c->settle[i]){c->moving[i]=false;pin_write(c->opened[i],c->target[i]?LOW:HIGH);pin_write(c->closed[i],c->target[i]?HIGH:LOW);}}
void chip_init(){
 chip_state_t* c=calloc(1,sizeof(chip_state_t));c->step=pin_init("STEP",INPUT_PULLDOWN);c->dir=pin_init("DIR",INPUT_PULLDOWN);c->enable=pin_init("ENABLE",OUTPUT_LOW);c->down=pin_init("DOWN",OUTPUT_HIGH);c->up=pin_init("UP",OUTPUT_LOW);c->jam=attr_init("jam",0);
 c->pwm[0]=pin_init("ENTRY_PWM",INPUT_PULLDOWN);c->pwm[1]=pin_init("EXIT_PWM",INPUT_PULLDOWN);
 c->opened[0]=pin_init("ENTRY_OPEN",OUTPUT_HIGH);c->closed[0]=pin_init("ENTRY_CLOSED",OUTPUT_LOW);
 c->opened[1]=pin_init("EXIT_OPEN",OUTPUT_HIGH);c->closed[1]=pin_init("EXIT_CLOSED",OUTPUT_LOW);pin_init("GND",INPUT);
 const pin_watch_config_t watch={.edge=BOTH,.pin_change=changed,.user_data=c};pin_watch(c->step,&watch);pin_watch(c->pwm[0],&watch);pin_watch(c->pwm[1],&watch);
 const timer_config_t config={.callback=tick,.user_data=c};timer_t timer=timer_init(&config);timer_start(timer,1000,true);
}
