#include "../control.h"
#include <cassert>
#include <cstdio>
using namespace larp;
int main(){
 Inputs input;input.up=true;BayControl bay;bay.tick(input,0);bay.tick(input,2100);assert(bay.state==UP);
 assert(bay.request(true,input,2100));assert(bay.state==LOWERING&&bay.motorEnabled());
 input.up=false;bay.tick(input,2200);assert(bay.state==LOWERING);input.down=true;bay.tick(input,2500);assert(bay.state==LOWERING);bay.tick(input,2550);assert(bay.state==DOWN&&!bay.motorEnabled());
 input.occupied=true;bay.tick(input,2600);assert(!bay.request(false,input,2700));assert(bay.state==DOWN);input.occupied=false;bay.tick(input,2800);assert(!bay.request(false,input,3000));bay.tick(input,5000);assert(bay.request(false,input,5000));input.down=false;bay.tick(input,5100);input.up=true;bay.tick(input,5500);bay.tick(input,5550);assert(bay.state==UP);puts("lower raise and independent limits PASS");
 assert(bay.request(true,input,6000));bay.tick(input,14001);assert(bay.state==FAULT&&!bay.motorEnabled());assert(!bay.request(true,input,14002));assert(bay.reset(input,14003));assert(bay.state==UP);puts("jam timeout latches and inspected reset PASS");
 assert(bay.request(true,input,16000));input.up=false;input.blocked=true;bay.tick(input,16100);assert(bay.state==FAULT&&!bay.motorEnabled());input.blocked=false;assert(!bay.reset(input,16200));input.up=true;assert(bay.reset(input,17000));puts("obstruction stops and unknown position cannot reset PASS");
 input.powerGood=false;bay.tick(input,18000);assert(bay.state==FAULT);input.powerGood=true;assert(bay.reset(input,19000));input.linkGood=false;bay.tick(input,20000);assert(bay.state==FAULT);input.linkGood=true;assert(bay.reset(input,21000));input.emergency=true;bay.tick(input,22000);assert(bay.state==FAULT&&!bay.motorEnabled());input.emergency=false;input.down=true;assert(!bay.reset(input,23000));puts("power link emergency and contradictory limits PASS");
 input.down=true;input.up=false;assert(bay.reset(input,24000));bay.tick(input,27000);assert(bay.request(false,input,27000));input.down=false;input.occupied=true;bay.tick(input,27100);assert(bay.state==FAULT&&!bay.motorEnabled());puts("occupancy appearing during raise stops motor PASS");
}
