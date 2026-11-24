#pragma once
#include <Arduino.h>
#include <Preferences.h>
#include <WiFi.h>

struct Credentials {
  char ssid[33],password[65],hexKey[65],pairId[17];
};
struct ChatRow {
  char id[100],title[49],context[33],provider[16],state[12],label[24];
  int hue; bool pin;
  uint64_t reviewSince;
};
struct View {
  int page,pages,total,quiet,count;
  bool all;
  ChatRow rows[4];
  char message[36];
  uint64_t serverNow;
  uint32_t receivedMs;
};
struct Query {int page;bool all;char open[100];};
extern Credentials cfg;
extern char hostName[24];
extern QueueHandle_t views,queries;
extern volatile bool pcOnline;
extern volatile int updatePercent;
void networkLoop(void*);
void displaySetup();
bool panelCommand(const String &line);
void displayLoop();
