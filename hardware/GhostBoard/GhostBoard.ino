#include "board.h"
#include <ArduinoJson.h>
#include <ESPmDNS.h>

Credentials cfg={};
char hostName[24];
QueueHandle_t views,queries;
volatile bool pcOnline=false;
static String line;
static bool dropping=false;

bool hexString(const char *value,size_t size) {
  return strlen(value)==size && strspn(value,"0123456789abcdef")==size;
}
void serialCommand() {
  if(line=="OTA?"){Serial.println("GHOST OTA 1");return;}
  if(panelCommand(line))return;
  if(line=="GHOST?") {
    Serial.printf("GHOST1 %s %s %s\n",hostName,WiFi.isConnected()?WiFi.localIP().toString().c_str():"0.0.0.0",cfg.pairId[0]?cfg.pairId:"none");
    return;
  }
  if(!line.startsWith("PAIR "))return;
  StaticJsonDocument<1024> doc;
  if(deserializeJson(doc,line.c_str()+5)){Serial.println("GHOST ERROR format");return;}
  const char *ssid=doc["ssid"]|"",*password=doc["password"]|"",*key=doc["key"]|"",*id=doc["pairId"]|"";
  if(!strlen(ssid)||strlen(ssid)>32||strlen(password)>64||!hexString(key,64)||!hexString(id,16)){
    Serial.println("GHOST ERROR fields");return;
  }
  Credentials next={};
  strlcpy(next.ssid,ssid,sizeof(next.ssid));strlcpy(next.password,password,sizeof(next.password));
  strlcpy(next.hexKey,key,sizeof(next.hexKey));strlcpy(next.pairId,id,sizeof(next.pairId));
  Preferences prefs;prefs.begin("ghostdesk",false);
  bool saved=prefs.putBytes("network",&next,sizeof(next))==sizeof(next);
  prefs.end();
  if(!saved){Serial.println("GHOST ERROR storage");return;}
  Serial.println("GHOST SAVED");Serial.flush();ESP.restart();
}
void setup() {
  Serial.begin(115200);line.reserve(768);
  uint64_t mac=ESP.getEfuseMac();
  snprintf(hostName,sizeof(hostName),"ghostdesk-%04x%08x",(unsigned)((mac>>32)&0xffff),(unsigned)mac);
  Preferences prefs;prefs.begin("ghostdesk",true);
  if(prefs.getBytesLength("network")==sizeof(cfg))prefs.getBytes("network",&cfg,sizeof(cfg));
  prefs.end();
  views=xQueueCreate(1,sizeof(View));queries=xQueueCreate(1,sizeof(Query));
  displaySetup();
  if(cfg.ssid[0]){
    WiFi.persistent(false);WiFi.mode(WIFI_STA);WiFi.setHostname(hostName);WiFi.setAutoReconnect(true);
    WiFi.begin(cfg.ssid,cfg.password);
    xTaskCreate(networkLoop,"board link",14336,nullptr,1,nullptr);
  }
}
void loop() {
  while(Serial.available()){
    char c=Serial.read();
    if(c=='\n'){if(!dropping)serialCommand();line="";dropping=false;}
    else if(c!='\r'&&!dropping){if(line.length()<768)line+=c;else dropping=true;}
  }
  displayLoop();
  delay(8);
}
