#pragma once
#include <stdint.h>
#include <stdbool.h>
typedef uint32_t pin_t;typedef uint32_t uart_dev_t;typedef uint32_t timer_t;typedef uint32_t buffer_t;
#define HIGH 1
#define LOW 0
#define INPUT 0
#define INPUT_PULLUP 1
#define INPUT_PULLDOWN 2
#define OUTPUT_HIGH 3
#define OUTPUT_LOW 4
#define BOTH 3
#define NO_PIN 0xffffffff
typedef struct {uint32_t edge;void(*pin_change)(void*,pin_t,uint32_t);void*user_data;} pin_watch_config_t;
typedef struct {void(*callback)(void*);void*user_data;} timer_config_t;
typedef struct {pin_t rx,tx;uint32_t baud_rate;void(*rx_data)(void*,uint8_t);void(*write_done)(void*);void*user_data;} uart_config_t;
pin_t pin_init(const char*,uint32_t);void pin_write(pin_t,uint32_t);uint32_t pin_read(pin_t);void pin_watch(pin_t,const pin_watch_config_t*);
uint32_t attr_init(const char*,uint32_t);uint32_t attr_read(uint32_t);uint64_t get_sim_nanos(void);
timer_t timer_init(const timer_config_t*);void timer_start(timer_t,uint32_t,bool);void timer_stop(timer_t);
uart_dev_t uart_init(const uart_config_t*);bool uart_write(uart_dev_t,uint8_t*,uint32_t);
buffer_t framebuffer_init(uint32_t*,uint32_t*);void buffer_write(buffer_t,uint32_t,const void*,uint32_t);
