#pragma once
// Pixel data from the desktop sprites.json atlas, in the same state order used by the display.
static const uint16_t ghostMask[16]={0x7e0,0x1ff8,0x3ffc,0x7ffe,0x7ffe,0xffff,0xffff,0xffff,0xffff,0xffff,0xffff,0xffff,0xffff,0xf7df,0xe38f,0xc107};
struct Mark {uint8_t x,y,w,h,ink;};
static const char *const faces[]={"available","working","attention","review","finished","stopped","unknown"};
static const Mark marks[][12]={
  {{3,6,3,3,2},{9,6,3,3,2},{4,7,1,1,1},{10,7,1,1,1}}, // available
  {{3,5,4,4,2},{10,5,4,4,2},{5,5,2,3,1},{12,5,2,3,1},{5,11,1,1,1},{8,11,1,1,1},{11,11,1,1,1}}, // working
  {{2,5,3,4,2},{7,5,3,4,2},{3,6,1,2,1},{8,6,1,2,1},{5,10,2,2,1},{12,0,4,9,1},{13,1,2,4,3},{13,6,2,2,3}}, // attention
  {{2,5,4,4,2},{8,5,4,4,2},{3,6,2,2,1},{9,6,2,2,1},{5,10,1,1,1},{6,11,3,1,1},{9,10,1,1,1},{11,0,5,5,1},{12,1,3,3,2}}, // review
  {{2,7,4,1,1},{9,7,4,1,1},{6,10,3,1,1}}, // finished
  {{2,5,4,2,1},{9,5,4,2,1},{6,9,4,3,1}}, // stopped
  {{6,4,4,1,1},{9,5,2,2,1},{7,7,3,1,1},{7,8,1,2,1},{7,11,1,1,1}}, // unknown
  {{1,4,6,8,1},{8,4,6,8,1},{2,5,4,6,2},{9,5,4,6,2},{4,7,2,3,1},{11,7,2,3,1}}, // eaten: floating eyes
};
