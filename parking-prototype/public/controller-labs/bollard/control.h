#pragma once
#include <stdint.h>
namespace larp {
enum State {UNINITIALIZED,UP,DOWN,LOWERING,RAISING,FAULT};
struct Inputs {bool up=false,down=false,occupied=false,blocked=false,powerGood=true,linkGood=true,emergency=false;};
class BayControl {
 bool clearTracking=false,limitTracking=false;uint32_t clearAt=0,limitAt=0,moveAt=0;
 void fail(const char* reason){state=FAULT;error=reason;limitTracking=false;}
 public:
 State state=UNINITIALIZED;const char* error="BOOT";const char* rejection="";
 const char* name()const{const char* names[]={"UNKNOWN","UP","DOWN","MOVING_DOWN","MOVING_UP","FAULT"};return names[state];}
 bool motorEnabled()const{return state==LOWERING||state==RAISING;}
 bool reset(const Inputs& i,uint32_t now){
  if(motorEnabled()||!i.powerGood||!i.linkGood||i.emergency||i.blocked||i.up==i.down){rejection="INSPECT_INPUTS_AND_STABLE_END_STOP";return false;}
  state=i.up?UP:DOWN;error="HEALTHY";rejection="";limitTracking=false;clearTracking=!i.occupied;clearAt=now;return true;
 }
 bool request(bool lower,const Inputs& i,uint32_t now){
  rejection="";
  if(state==FAULT||state==UNINITIALIZED){rejection="FAULT_LATCHED_INSPECTION_REQUIRED";return false;}
  if(!i.powerGood||!i.linkGood||i.emergency||i.blocked||i.up==i.down){rejection="UNSAFE_INPUT";return false;}
  if(i.occupied){rejection="BAY_OCCUPIED";return false;}
  if(lower?state!=UP:state!=DOWN){rejection="NOT_AT_REQUIRED_END_STOP";return false;}
  if(!lower&&(!clearTracking||now-clearAt<2000)){rejection="WAIT_FOR_STABLE_CLEAR";return false;}
  state=lower?LOWERING:RAISING;moveAt=now;limitTracking=false;return true;
 }
 void tick(const Inputs& i,uint32_t now){
  if(!i.occupied){if(!clearTracking){clearTracking=true;clearAt=now;}}else clearTracking=false;
  if(!i.powerGood){fail("POWER_INPUT_UNAVAILABLE");return;}
  if(!i.linkGood){fail("CONTROLLER_LINK_FIXTURE_OFFLINE");return;}
  if(i.emergency){fail("EMERGENCY_STOP");return;}
  if(i.blocked){fail("OBSTRUCTION_OR_OPEN_SAFETY_LOOP");return;}
  if(i.up&&i.down){fail("CONTRADICTORY_LIMITS");return;}
  if(state==UNINITIALIZED){reset(i,now);if(state==UNINITIALIZED)fail("BOOT_POSITION_UNKNOWN");return;}
  if(state==FAULT)return;
  if(motorEnabled()){
   if(state==RAISING&&i.occupied){fail("OCCUPANCY_DURING_RAISE");return;}
   const bool reached=state==LOWERING?i.down:i.up;
   if(reached){if(!limitTracking){limitTracking=true;limitAt=now;}if(now-limitAt>=40){state=state==LOWERING?DOWN:UP;limitTracking=false;}}
   else limitTracking=false;
   if(motorEnabled()&&now-moveAt>8000)fail("MOTOR_TIMEOUT_CHECK_DRIVER_PLANT_LIMITS");
  }else if((state==UP&&!i.up)||(state==DOWN&&!i.down))fail("STABLE_LIMIT_LOST");
 }
};
}
