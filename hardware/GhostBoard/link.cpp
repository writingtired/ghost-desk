#include "board.h"
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <esp_system.h>
#include <lwip/sockets.h>
#include <mbedtls/ssl.h>

static int randomBytes(void*,unsigned char *out,size_t n){esp_fill_random(out,n);return 0;}
struct Channel {int fd;uint32_t until;};
static int waitFor(Channel *c,bool writing) {
  int32_t left=(int32_t)(c->until-millis());
  if(left<=0)return 0;
  timeval tv={left/1000,(left%1000)*1000};
  fd_set set;FD_ZERO(&set);FD_SET(c->fd,&set);
  return select(c->fd+1,writing?nullptr:&set,writing?&set:nullptr,nullptr,&tv);
}
static int sendBytes(void *p,const unsigned char *buf,size_t n){
  Channel *c=(Channel*)p;
  if(waitFor(c,true)<=0)return MBEDTLS_ERR_SSL_TIMEOUT;
  int count=send(c->fd,buf,n,0);
  return count>=0?count:MBEDTLS_ERR_SSL_INTERNAL_ERROR;
}
static int readBytes(void *p,unsigned char *buf,size_t n){
  Channel *c=(Channel*)p;
  if(waitFor(c,false)<=0)return MBEDTLS_ERR_SSL_TIMEOUT;
  int count=recv(c->fd,buf,n,0);
  return count>=0?count:MBEDTLS_ERR_SSL_INTERNAL_ERROR;
}
static char reply[3584];
static StaticJsonDocument<4096> pageDoc;
static bool fetchPage(mbedtls_ssl_context *ssl,Channel &c,Query &q) {
  StaticJsonDocument<256> req;req["v"]=1;req["page"]=q.page;req["all"]=q.all;
  if(q.open[0])req["open"]=q.open;
  char line[260];size_t len=serializeJson(req,line,sizeof(line)-1);line[len++]='\n';
  c.until=millis()+21000;
  for(size_t offset=0;offset<len;){
    int n=mbedtls_ssl_write(ssl,(unsigned char*)line+offset,len-offset);
    if(n<=0)return false;offset+=n;
  }
  size_t used=0;
  while(used<sizeof(reply)-1) {
    int n=mbedtls_ssl_read(ssl,(unsigned char*)reply+used,sizeof(reply)-1-used);
    if(n<=0)return false;used+=n;
    if(reply[used-1]=='\n')break;
  }
  if(!used||reply[used-1]!='\n')return false;
  reply[used]=0;
  if(deserializeJson(pageDoc,reply)||pageDoc["v"]!=1||!pageDoc["items"].is<JsonArray>())return false;
  View view={};view.page=pageDoc["page"];view.pages=pageDoc["pages"];view.all=pageDoc["all"];
  view.total=pageDoc["total"];view.quiet=pageDoc["quiet"];
  strlcpy(view.message,pageDoc["msg"]|"",sizeof(view.message));
  for(JsonObject row:pageDoc["items"].as<JsonArray>()){
    if(view.count==4)break;ChatRow &r=view.rows[view.count++];
    strlcpy(r.id,row["id"]|"",sizeof(r.id));strlcpy(r.title,row["title"]|"",sizeof(r.title));
    strlcpy(r.context,row["context"]|"",sizeof(r.context));strlcpy(r.provider,row["provider"]|"",sizeof(r.provider));
    strlcpy(r.label,row["label"]|"",sizeof(r.label));strlcpy(r.state,row["state"]|"unknown",sizeof(r.state));
    r.hue=row["hue"];r.pin=row["pin"];
  }
  q.page=view.page;q.open[0]=0;
  xQueueOverwrite(views,&view);pcOnline=true;
  return true;
}
static void serve(WiFiClient &client,mbedtls_ssl_config &conf) {
  Channel c={client.fd(),millis()+5000};
  mbedtls_ssl_context ssl;mbedtls_ssl_init(&ssl);
  if(mbedtls_ssl_setup(&ssl,&conf)==0){
    mbedtls_ssl_set_bio(&ssl,&c,sendBytes,readBytes,nullptr);
    if(mbedtls_ssl_handshake(&ssl)==0){
      Query q={};
      xQueueReset(queries);
      while(WiFi.isConnected() && fetchPage(&ssl,c,q))xQueueReceive(queries,&q,pdMS_TO_TICKS(1800));
    }
  }
  pcOnline=false;mbedtls_ssl_free(&ssl);client.stop();
}
void networkLoop(void*) {
  unsigned char key[32];for(int i=0;i<32;i++){char hex[]={cfg.hexKey[2*i],cfg.hexKey[2*i+1],0};key[i]=strtoul(hex,nullptr,16);}
  static const unsigned char identity[]="ghostdesk";
  static const int suites[]={MBEDTLS_TLS_PSK_WITH_AES_128_GCM_SHA256,0};
  mbedtls_ssl_config conf;mbedtls_ssl_config_init(&conf);
  if(mbedtls_ssl_config_defaults(&conf,MBEDTLS_SSL_IS_SERVER,MBEDTLS_SSL_TRANSPORT_STREAM,MBEDTLS_SSL_PRESET_DEFAULT)||
     mbedtls_ssl_conf_psk(&conf,key,sizeof(key),identity,sizeof(identity)-1)) {vTaskDelete(nullptr);return;}
  mbedtls_ssl_conf_min_version(&conf,MBEDTLS_SSL_MAJOR_VERSION_3,MBEDTLS_SSL_MINOR_VERSION_3);
  mbedtls_ssl_conf_ciphersuites(&conf,suites);mbedtls_ssl_conf_rng(&conf,randomBytes,nullptr);
  WiFiServer server(43822);bool listening=false;uint32_t retry=millis();
  for(;;){
    if(!WiFi.isConnected()){
      pcOnline=false;
      if(listening){server.end();MDNS.end();listening=false;}
      if(millis()-retry>18000){retry=millis();WiFi.reconnect();}
    }else{
      if(!listening){server.begin();server.setNoDelay(true);MDNS.begin(hostName);listening=true;}
      WiFiClient client=server.available();if(client)serve(client,conf);
    }
    delay(50);
  }
}
