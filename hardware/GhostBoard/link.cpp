#include "board.h"
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <esp_system.h>
#include <lwip/sockets.h>
#include <mbedtls/ssl.h>
#include <esp_ota_ops.h>

static const char target[]="GHOSTDESK_CYD2USB_OTA1";
static char runningBuild[65];
volatile int updatePercent=-1;
static bool imageDigest(const esp_partition_t *part,char out[65]){
  uint8_t digest[32];
  if(!part||esp_partition_get_sha256(part,digest)!=ESP_OK)return false;
  for(size_t i=0;i<sizeof(digest);i++)snprintf(out+2*i,3,"%02x",digest[i]);
  return true;
}

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
static bool writeLine(mbedtls_ssl_context *ssl,Channel &c,const char *line){
  c.until=millis()+15000;
  size_t len=strlen(line);
  while(len){
    int n=mbedtls_ssl_write(ssl,(const uint8_t*)line,len);
    if(n<=0)return false;
    line+=n;len-=n;
  }
  return true;
}
static bool installImage(mbedtls_ssl_context *ssl,Channel &c){
  const esp_partition_t *part=esp_ota_get_next_update_partition(nullptr);
  const char *expected=pageDoc["build"]|"";
  size_t size=pageDoc["size"]|0U;
  if(!part||size<256||size>part->size||strlen(expected)!=64||strspn(expected,"0123456789abcdef")!=64)return false;
  char wanted[65];strlcpy(wanted,expected,sizeof(wanted));
  esp_ota_handle_t handle;
  if(esp_ota_begin(part,size,&handle)!=ESP_OK)return false;
  size_t offset=0;
  updatePercent=0;
  while(offset<size){
    char request[64];snprintf(request,sizeof(request),"{\"ota\":\"read\",\"offset\":%u}\n",(unsigned)offset);
    if(!writeLine(ssl,c,request))break;
    size_t remaining=min((size_t)8192,size-offset);
    while(remaining){
      int n=mbedtls_ssl_read(ssl,(uint8_t*)reply,min(remaining,sizeof(reply)));
      if(n<=0||esp_ota_write(handle,reply,n)!=ESP_OK){esp_ota_abort(handle);return false;}
      offset+=n;remaining-=n;updatePercent=(int)(100*offset/size);
    }
  }
  if(offset!=size){esp_ota_abort(handle);return false;}
  char actual[65];
  if(esp_ota_end(handle)!=ESP_OK||!imageDigest(part,actual)||strcmp(actual,wanted))return false;
  if(esp_ota_set_boot_partition(part)!=ESP_OK)return false;
  writeLine(ssl,c,"{\"ota\":\"boot\"}\n");
  delay(100);ESP.restart();return true;
}
static bool fetchPage(mbedtls_ssl_context *ssl,Channel &c,Query &q) {
  StaticJsonDocument<512> req;req["v"]=1;req["page"]=q.page;req["all"]=q.all;
  if(runningBuild[0]){req["target"]=target;req["build"]=runningBuild;}
  if(q.open[0])req["open"]=q.open;
  char line[440];size_t len=serializeJson(req,line,sizeof(line)-1);line[len++]='\n';
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
  if(deserializeJson(pageDoc,reply)||pageDoc["v"]!=1)return false;
  if(pageDoc["ota"]=="install"&&pageDoc["target"]==target){
    if(!installImage(ssl,c))writeLine(ssl,c,"{\"ota\":\"failed\"}\n");
    updatePercent=-1;return false;
  }
  if(!pageDoc["items"].is<JsonArray>())return false;
  View view={};view.page=pageDoc["page"];view.pages=pageDoc["pages"];view.all=pageDoc["all"];
  view.total=pageDoc["total"];view.quiet=pageDoc["quiet"];
  view.attention=pageDoc["attention"];view.working=pageDoc["working"];view.reviews=pageDoc["reviews"];
  view.serverNow=pageDoc["now"].as<uint64_t>();view.receivedMs=millis();
  strlcpy(view.message,pageDoc["msg"]|"",sizeof(view.message));
  for(JsonObject row:pageDoc["items"].as<JsonArray>()){
    if(view.count==4)break;ChatRow &r=view.rows[view.count++];
    strlcpy(r.id,row["id"]|"",sizeof(r.id));strlcpy(r.title,row["title"]|"",sizeof(r.title));
    strlcpy(r.context,row["context"]|"",sizeof(r.context));strlcpy(r.provider,row["provider"]|"",sizeof(r.provider));
    strlcpy(r.label,row["label"]|"",sizeof(r.label));strlcpy(r.state,row["state"]|"unknown",sizeof(r.state));
    r.hue=row["hue"];r.pin=row["pin"];
    r.reviewSince=row["reviewSince"].as<uint64_t>();
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
  imageDigest(esp_ota_get_running_partition(),runningBuild);
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
