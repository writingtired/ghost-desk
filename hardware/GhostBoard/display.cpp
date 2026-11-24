#include "board.h"
#include "sprites.h"
#include "brand.h"
#include <SPI.h>
#include <Adafruit_ILI9341.h>
#include <Adafruit_ST7789.h>
#include <math.h>

static SPIClass lcdBus(HSPI);
static Adafruit_ILI9341 ili(&lcdBus,2,15,-1);
static Adafruit_ST7789 st(&lcdBus,15,2,-1);
static Adafruit_SPITFT *lcd;
struct Panel {const char *name;bool st7789,invert;};
static const Panel panels[]={{"ST7789",true,false},{"ILI9341",false,false},
                             {"ST7789-inverted",true,true},{"ILI9341-inverted",false,true}};
static uint8_t activePanel=0;
static const char *touchKey(){return panels[activePanel].st7789?"touch-st":"touch";}
bool panelCommand(const String &line){
  if(line=="PANEL?"){Serial.printf("GHOST PANEL %s\n",panels[activePanel].name);return true;}
  if(!line.startsWith("PANEL "))return false;
  String requested=line.substring(6);
  for(uint8_t i=0;i<sizeof(panels)/sizeof(panels[0]);i++){
    if(requested!=panels[i].name)continue;
    if(i!=activePanel){
      Preferences p;
      bool saved=p.begin("ghostdesk",false)&&p.putUChar("panel",i)==1;
      p.end();if(!saved){Serial.println("GHOST ERROR panel storage");return true;}
      Serial.flush();ESP.restart();
    }
    return true;
  }
  Serial.println("GHOST ERROR unknown panel");return true;
}
static GFXcanvas16 tile(32,32);
static const uint16_t base=0x10c3,white=0xef9e,muted=0xa596,amber=0xfe70;
static const int tClk=25,tDin=32,tDout=39,tCs=33,tIrq=36;
struct Point {int x,y;};
struct Calibration {Point raw[3];};
static Calibration cal={};
static const Point targets[]={{24,24},{295,24},{24,215},{160,120}};
// Calibration records stay in the original landscape coordinate system.
static Point mountedPoint(Point p){return {319-p.x,239-p.y};}
static int step=0;
static View view={};
static bool dirty=true,held=false,pending=false;
static uint32_t downAt,lastAnim,bootSince,msgUntil;
static Point finger={};static char downId[100],statusMsg[36];
static int downControl=-1,lastMode=-1;
static bool calibrated(){return step>=4;}
static void text(int x,int y,const char *s,int size,uint16_t ink,int chars){
  lcd->setCursor(x,y);lcd->setTextColor(ink);lcd->setTextSize(size);
  int n=strlen(s);for(int i=0;i<n&&i<chars;i++)lcd->write(n>chars&&i==chars-1?'~':s[i]);
}
static uint16_t rgb(int r,int g,int b){return lcd->color565(r,g,b);}
static void brand(int x,int y){
  for(int j=0;j<16;j++)for(int i=0;i<16;i++){
    char p=brandPixels[j][i];
    if(p!=' ')lcd->drawPixel(x+i,y+j,p=='M'?rgb(157,225,197):p=='W'?0xffff:rgb(22,43,50));
  }
  text(x+22,y+1,"Ghost Desk",2,white,10);
}
static uint16_t hueColor(int deg){
  float h=(deg%360)/60.f,c=.4368f,x=c*(1-fabsf(fmodf(h,2)-1)),m=.72f-c/2;
  float r=h<1||h>=5?c:h<2||h>=4?x:0;
  float g=h<1?x:h<3?c:h<4?x:0;
  float b=h<2?0:h<3?x:h<5?c:x;
  return rgb((r+m)*255,(g+m)*255,(b+m)*255);
}
static void colors(const char *provider,uint16_t &badge,uint16_t &wash){
  bool clay=strstr(provider,"Claude")!=nullptr;
  bool blue=!strcmp(provider,"Antigravity")||!strcmp(provider,"Gemini");
  int r=clay?83:blue?51:44,g=clay?59:blue?65:73,b=clay?50:blue?91:62;
  badge=rgb(r,g,b);wash=rgb((54+r)/4,(69+g)/4,(84+b)/4);
}
static bool flashed[4]={};
static bool reviewFlash(const ChatRow &r){
  if(!r.reviewSince||!view.serverNow)return false;
  uint64_t now=view.serverNow+uint32_t(millis()-view.receivedMs);
  if(now<r.reviewSince)return false;
  uint64_t age=now-r.reviewSince;
  return age%(age<30000?5000:2000)<750;
}
static void ghost(int row,bool frame,bool eaten=false){
  const ChatRow &r=view.rows[row];uint16_t badge,wash;colors(r.provider,badge,wash);
  tile.fillScreen(eaten?uint16_t(~badge):badge);
  int face=0;while(face<6 && strcmp(r.state,faces[face]))face++;
  int dx=frame&&face==2?2:0,dy=frame&&face==1?-2:0;
  int ox=8+dx,oy=8+dy;uint16_t body=face==6?0x8410:hueColor(r.hue);
  if(!eaten)for(int y=0;y<16;y++)for(int x=0;x<16;x++)if(ghostMask[y]&(0x8000>>x))tile.drawPixel(ox+x,oy+y,body);
  const uint16_t inks[]={0,0x18c8,0xffff,amber};
  for(const auto &p:marks[eaten?7:face])if(p.w)tile.fillRect(ox+p.x,oy+p.y,p.w,p.h,inks[p.ink]);
  lcd->drawRGBBitmap(5,32+row*43,tile.getBuffer(),32,32);
}
static void drawRow(int i,bool flash){
    const ChatRow &r=view.rows[i];int y=27+i*43;uint16_t badge,wash;colors(r.provider,badge,wash);
    flashed[i]=flash;
    lcd->fillRect(0,y,320,42,flash?uint16_t(~wash):wash);ghost(i,false,flash);
    int titleSize=strlen(r.title)<=14?2:1;
    text(45,y+(titleSize==2?4:8),r.title,titleSize,flash?base:white,titleSize==2?14:28);
    char detail[90];snprintf(detail,sizeof(detail),"%s%s / %s",r.pin?"* ":"",r.provider,r.context);
    text(45,y+28,detail,1,flash?base:muted,28);
    bool wait=!strcmp(r.state,"attention"),review=!strcmp(r.state,"review"),work=!strcmp(r.state,"working");
    uint16_t ink=flash?base:wait?amber:review?rgb(181,195,251):work?rgb(157,225,197):muted;
    int sx=223,sy=y+20;
    if(review){lcd->drawLine(sx,sy-3,sx+3,sy,ink);lcd->drawLine(sx+3,sy,sx,sy+3,ink);lcd->drawLine(sx,sy+3,sx-3,sy,ink);lcd->drawLine(sx-3,sy,sx,sy-3,ink);}
    else if(wait)text(sx-2,sy-4,"!",1,ink,1);
    else if(work)lcd->fillCircle(sx,sy,2,ink);
    else lcd->drawFastHLine(sx-2,sy,5,ink);
    text(232,sy-3,wait?"Needs you":review?"To review":r.label,1,ink,14);
}
static uint32_t connectedUntil;
static void page(){
  lcd->fillScreen(base);brand(5,5);
  char summary[28]="All quiet";
  if(connectedUntil)strcpy(summary,"Connected");
  else if(view.attention)snprintf(summary,sizeof(summary),"%d need%s you",view.attention,view.attention==1?"s":"");
  else if(view.reviews)snprintf(summary,sizeof(summary),"%d to review",view.reviews);
  else if(view.working)snprintf(summary,sizeof(summary),"%d working",view.working);
  text(313-6*strlen(summary),10,summary,1,view.attention&&!connectedUntil?amber:rgb(157,225,197),24);
  for(int i=0;i<view.count;i++)drawRow(i,reviewFlash(view.rows[i]));
  if(!view.count)text(14,94,view.total?"No current work":"No recent chats",2,muted,24);
  lcd->drawFastHLine(0,201,320,0x42a8);
  char left[22];snprintf(left,sizeof(left),view.all?"Current work":"Other chats  %d >",view.quiet);
  text(8,208,left,1,white,16);text(124,215,"< Prev",1,view.page?white:muted,8);
  char n[24];snprintf(n,sizeof(n),"%d chats",view.total);text(8,224,n,1,muted,14);
  snprintf(n,sizeof(n),"%d/%d",view.page+1,view.pages);text(192,215,n,1,muted,9);
  text(263,215,"Next >",1,view.page+1<view.pages?white:muted,8);
  if(statusMsg[0]){lcd->fillRect(0,203,320,37,base);text(8,214,statusMsg,1,amber,50);}
}
static byte transfer(byte value){
  byte result=0;
  for(int bit=7;bit>=0;bit--){digitalWrite(tDin,(value>>bit)&1);digitalWrite(tClk,HIGH);result=(result<<1)|digitalRead(tDout);digitalWrite(tClk,LOW);}
  return result;
}
static int axis(byte cmd){
  transfer(cmd);int hi=transfer(0);int lo=transfer(0);return ((hi<<8)|lo)>>3;
}
static int middle(int a,int b,int c){return max(min(a,b),min(max(a,b),c));}
static Point sample(){
  int x[3],y[3];digitalWrite(tCs,LOW);
  for(int i=0;i<3;i++){axis(0xd0);x[i]=axis(0xd0);axis(0x90);y[i]=axis(0x90);}
  digitalWrite(tCs,HIGH);return {middle(x[0],x[1],x[2]),middle(y[0],y[1],y[2])};
}
static bool mapTouch(Point p,Point &out){
  Point a=cal.raw[0],b=cal.raw[1],c=cal.raw[2];
  float x1=b.x-a.x,y1=b.y-a.y,x2=c.x-a.x,y2=c.y-a.y,d=x1*y2-x2*y1;
  if(fabsf(d)<300000)return false;
  float x=p.x-a.x,y=p.y-a.y;out=mountedPoint({int(24+271*(x*y2-y*x2)/d),int(24+191*(x1*y-y1*x)/d)});
  return true;
}
static int control(Point p){
  if(p.x<0||p.x>=320||p.y<0||p.y>=240)return -1;
  if(p.y>=202)return p.x<106?4:p.x<188?5:p.x>=247?6:-1;
  if(p.y<27)return -1;int row=(p.y-27)/43;return row<view.count?row:-1;
}
static void releaseTouch(){
  if(!calibrated()){
    if(step<3){cal.raw[step++]=finger;}
    else {Point test;Point center=mountedPoint(targets[3]);if(mapTouch(finger,test)&&abs(test.x-center.x)<26&&abs(test.y-center.y)<26){
      Preferences p;p.begin("ghostdesk",false);p.putBytes(touchKey(),&cal,sizeof(cal));p.end();step=4;
    }else step=0;}
    dirty=true;return;
  }
  Point where;if(!pcOnline||pending||statusMsg[0]||!mapTouch(finger,where)||control(where)!=downControl)return;
  Query q={};q.page=view.page;q.all=view.all;
  if(downControl>=0&&downControl<view.count&&!strcmp(downId,view.rows[downControl].id)){
    strlcpy(q.open,downId,sizeof(q.open));strlcpy(statusMsg,"Opening on PC...",sizeof(statusMsg));
  }else if(downControl==4){q.page=0;q.all=!q.all;}
  else if(downControl==5&&view.page>0)q.page--;
  else if(downControl==6&&view.page+1<view.pages)q.page++;
  else return;
  pending=true;msgUntil=millis()+21000;xQueueOverwrite(queries,&q);dirty=true;
}
static void paint(int mode){
  if(mode==3){page();return;}
  lcd->fillScreen(base);
  if(mode==0){text(58,71,"Touch calibration",2,white,18);text(56,98,"Tap the cross with the stylus",1,muted,38);
    const Point p=mountedPoint(targets[step]);lcd->drawCircle(p.x,p.y,9,amber);lcd->drawFastHLine(p.x-12,p.y,25,amber);lcd->drawFastVLine(p.x,p.y-12,25,amber);return;}
  brand(16,20);
  text(16,86,mode==1?"Pair over USB":mode==2?"Joining Wi-Fi":"Waiting for PC",2,white,24);
  text(16,122,mode==1?"Run Set up board.cmd on Windows.":mode==2?"Check 2.4 GHz Wi-Fi or pair again.":"Open the paired Ghost Desk app.",1,muted,48);
  text(16,184,hostName,1,muted,32);
  if(mode==4)text(16,203,WiFi.localIP().toString().c_str(),1,muted,24);
}
void displaySetup(){
  pinMode(21,OUTPUT);digitalWrite(21,LOW);
  Preferences p;p.begin("ghostdesk",true);
  activePanel=p.getUChar("panel",0);
  if(activePanel>=sizeof(panels)/sizeof(panels[0]))activePanel=0;
  const Panel &panel=panels[activePanel];
  lcdBus.begin(14,12,13,15);
  if(panel.st7789){
    st.init(240,320,SPI_MODE3);st.setRotation(3);
    // Preserve the CYD2USB panel's BGR subpixel order in rotated landscape.
    uint8_t landscapeBgr=ST77XX_MADCTL_MX|ST77XX_MADCTL_MV|0x08;
    st.sendCommand(ST77XX_MADCTL,&landscapeBgr,1);lcd=&st;
  }else{ili.begin(40000000);ili.setRotation(3);lcd=&ili;}
  lcd->invertDisplay(panel.invert);lcd->setTextWrap(false);lcd->fillScreen(base);digitalWrite(21,HIGH);
  pinMode(tCs,OUTPUT);digitalWrite(tCs,HIGH);pinMode(tClk,OUTPUT);digitalWrite(tClk,LOW);
  pinMode(tDin,OUTPUT);pinMode(tDout,INPUT);pinMode(tIrq,INPUT);pinMode(0,INPUT_PULLUP);
  if(p.getBytesLength(touchKey())==sizeof(cal)&&p.getBytes(touchKey(),&cal,sizeof(cal))==sizeof(cal)){Point test;if(mapTouch(cal.raw[0],test))step=4;}
  p.end();
}
void displayLoop(){
  static int shownUpdate=-1;
  int percent=updatePercent;
  if(percent>=0){
    if(shownUpdate<0){lcd->fillScreen(base);text(22,86,"Updating display",2,white,22);text(22,141,"Keep the board powered.",1,muted,40);}
    if(shownUpdate!=percent){
      lcd->fillRect(22,118,276,7,muted);lcd->fillRect(22,118,276*percent/100,7,amber);
      char label[8];snprintf(label,sizeof(label),"%d%%",percent);
      lcd->fillRect(254,87,48,18,base);text(254,87,label,2,white,4);
      shownUpdate=percent;
    }
    held=false;return;
  }
  if(shownUpdate>=0){shownUpdate=-1;dirty=true;}
  View next;
  if(xQueueReceive(views,&next,0)==pdTRUE){
    if(memcmp(&next,&view,offsetof(View,serverNow))||pending)dirty=true;
    view=next;
    if(next.message[0]){strlcpy(statusMsg,next.message,sizeof(statusMsg));msgUntil=millis()+1800;}
    else if(pending){statusMsg[0]=0;}
    pending=false;
  }
  if(!pcOnline){pending=false;statusMsg[0]=0;}
  if(statusMsg[0]&&(int32_t)(millis()-msgUntil)>=0){statusMsg[0]=0;dirty=true;}
  if(digitalRead(0)==LOW){if(!bootSince)bootSince=millis();if(millis()-bootSince>1600&&calibrated()){step=0;dirty=true;}}
  else bootSince=0;
  int mode=!calibrated()?0:!cfg.ssid[0]?1:!WiFi.isConnected()?2:pcOnline?3:4;
  if(mode==3&&lastMode!=3)connectedUntil=millis()+1200;
  if(connectedUntil&&(int32_t)(millis()-connectedUntil)>=0){connectedUntil=0;dirty=true;}
  if(mode!=lastMode||dirty){paint(mode);lastMode=mode;dirty=false;}
  if(mode==3)for(int i=0;i<view.count;i++){
    bool flash=reviewFlash(view.rows[i]);
    if(flashed[i]!=flash)drawRow(i,flash);
  }
  if(mode==3&&millis()-lastAnim>=360){lastAnim=millis();for(int i=0;i<view.count;i++)if(!strcmp(view.rows[i].state,"working")||!strcmp(view.rows[i].state,"attention"))ghost(i,(lastAnim/360)%2);}
  if(digitalRead(tIrq)==LOW){
    if(!held){held=true;downAt=millis();finger=sample();Point p;downControl=calibrated()&&mapTouch(finger,p)?control(p):-1;
      downId[0]=0;if(downControl>=0&&downControl<view.count)strlcpy(downId,view.rows[downControl].id,sizeof(downId));}
    else if(millis()-downAt>18)finger=sample();
  }else if(held){held=false;if(millis()-downAt>24)releaseTouch();}
}
